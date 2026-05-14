import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, otpTable } from "@workspace/db";
import {
  GetCurrentAuthUserResponse,
  type AuthUser,
} from "@workspace/api-zod";
import {
  AuthCredentials,
  COOKIE_SECURE,
  SESSION_COOKIE,
  SESSION_TTL,
  clearSession,
  createSession,
  getSessionId,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from "../lib/auth";
import { logger } from "../lib/logger";
import { authRateLimiter } from "../middlewares/security";
import { createOtp, verifyOtp } from "../lib/otp";
import { sendOtpEmail } from "../lib/brevo";

const router: IRouter = Router();
const GOOGLE_STATE_COOKIE = "google_oauth_state";
const GOOGLE_RETURN_TO_COOKIE = "google_oauth_return_to";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[A-Za-z][A-Za-z\s.'-]{0,79}$/;
const OTP_PATTERN = /^\d{6}$/;

router.use("/register", authRateLimiter);
router.use("/login", authRateLimiter);
router.use("/auth/google", authRateLimiter);

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SECURE ? "none" : "lax",
    path: "/",
    maxAge: SESSION_TTL,
    signed: Boolean(process.env.SESSION_SECRET),
  });
}

function setOAuthCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SECURE ? "none" : "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60 * 1000,
    signed: Boolean(process.env.SESSION_SECRET),
  });
}

function clearOAuthCookies(res: Response) {
  const cookieOptions = {
    path: "/api/auth/google",
    sameSite: (COOKIE_SECURE ? "none" : "lax") as const,
    secure: COOKIE_SECURE,
  };
  res.clearCookie(GOOGLE_STATE_COOKIE, cookieOptions);
  res.clearCookie(GOOGLE_RETURN_TO_COOKIE, cookieOptions);
}

function readOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function readOAuthCookie(req: Request, name: string): string | undefined {
  const signedValue = req.signedCookies?.[name];
  if (typeof signedValue === "string" && signedValue) return signedValue;
  const value = req.cookies?.[name];
  return typeof value === "string" && value ? value : undefined;
}

function getGoogleAuthConfig(req: Request) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${readOrigin(req)}/api/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

function getGoogleStartUrl(req: Request, state: string): string {
  const { clientId, redirectUri } = getGoogleAuthConfig(req);
  if (!clientId) {
    throw new Error("Google OAuth client ID is not configured");
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("access_type", "online");
  return url.toString();
}

async function exchangeGoogleCode(req: Request, code: string): Promise<{ accessToken: string } | null> {
  const { clientId, clientSecret, redirectUri } = getGoogleAuthConfig(req);
  if (!clientId || !clientSecret) {
    return null;
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!tokenResponse.ok) {
    return null;
  }

  const payload = (await tokenResponse.json().catch(() => null)) as
    | { access_token?: string }
    | null;

  if (!payload?.access_token) {
    return null;
  }

  return { accessToken: payload.access_token };
}

async function fetchGoogleProfile(accessToken: string): Promise<{
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
} | null> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const profile = (await response.json().catch(() => null)) as
    | {
        email?: string;
        email_verified?: boolean;
        given_name?: string;
        family_name?: string;
        picture?: string;
      }
    | null;

  if (!profile?.email || profile.email_verified !== true) {
    return null;
  }

  return {
    email: normalizeEmail(profile.email),
    firstName: profile.given_name?.trim() || null,
    lastName: profile.family_name?.trim() || null,
    profileImageUrl: profile.picture?.trim() || null,
  };
}

async function findOrCreateGoogleUser(profile: {
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}) {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, profile.email));

  if (!existing) {
    return null;
  }

  const shouldUpdateProfile =
    existing.firstName == null ||
    existing.lastName == null ||
    existing.profileImageUrl == null ||
    existing.passwordHash == null ||
    !existing.verified;

  if (shouldUpdateProfile) {
    const [updated] = await db
      .update(usersTable)
      .set({
        firstName: existing.firstName ?? profile.firstName,
        lastName: existing.lastName ?? profile.lastName,
        profileImageUrl: existing.profileImageUrl ?? profile.profileImageUrl,
        verified: true,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      })
      .where(eq(usersTable.id, existing.id))
      .returning();

    return updated ?? existing;
  }

  return existing;
}

export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function mapUser(row: typeof usersTable.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    profileImageUrl: row.profileImageUrl,
  };
}

async function createAuthedSession(user: AuthUser): Promise<string> {
  return createSession({ user });
}

router.get("/auth/google", async (req: Request, res: Response) => {
  try {
    const returnTo = sanitizeReturnTo(req.query.returnTo);
    const state = crypto.randomBytes(24).toString("hex");
    setOAuthCookie(res, GOOGLE_STATE_COOKIE, state);
    setOAuthCookie(res, GOOGLE_RETURN_TO_COOKIE, returnTo);
    res.redirect(getGoogleStartUrl(req, state));
  } catch (error) {
    logger.error({ error }, "Google OAuth start failed");
    res.redirect("/");
  }
});

router.get("/auth/google/callback", async (req: Request, res: Response) => {
  const returnTo = sanitizeReturnTo(readOAuthCookie(req, GOOGLE_RETURN_TO_COOKIE));
  const expectedState = readOAuthCookie(req, GOOGLE_STATE_COOKIE);
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";

  clearOAuthCookies(res);

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const buildRedirectUrl = (path: string) => `${frontendUrl}${path}`;

  if (!code || !state || !expectedState || state !== expectedState) {
    res.redirect(buildRedirectUrl(`${returnTo}?auth=google_failed`));
    return;
  }

  try {
    const tokenResult = await exchangeGoogleCode(req, code);
    if (!tokenResult) {
      res.redirect(buildRedirectUrl(`${returnTo}?auth=google_failed`));
      return;
    }

    const profile = await fetchGoogleProfile(tokenResult.accessToken);
    if (!profile) {
      res.redirect(buildRedirectUrl(`${returnTo}?auth=google_failed`));
      return;
    }

    const userRow = await findOrCreateGoogleUser(profile);

    if (!userRow) {
      // New Google user! Do NOT insert into DB yet.
      const otp = await createOtp(profile.email, {
        type: "google",
        firstName: profile.firstName,
        lastName: profile.lastName,
        profileImageUrl: profile.profileImageUrl,
      });
      if (otp) {
        await sendOtpEmail(profile.email, otp);
      }
      
      const otpUrl = new URL(buildRedirectUrl(returnTo));
      otpUrl.searchParams.set("auth", "otp_required");
      otpUrl.searchParams.set("email", profile.email);
      res.redirect(otpUrl.toString());
      return;
    }

    const user = mapUser(userRow);
    const sid = await createAuthedSession(user);
    setSessionCookie(res, sid);
    res.redirect(buildRedirectUrl(returnTo));
  } catch (error) {
    logger.error({ error }, "Google OAuth callback failed");
    res.redirect(buildRedirectUrl(`${returnTo}?auth=google_failed`));
  }
});

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.post("/register", async (req: Request, res: Response) => {
  const parsed = validateCredentials(req.body, true);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const otp = await createOtp(email, {
    type: "email",
    firstName: parsed.data.firstName?.trim() || null,
    lastName: parsed.data.lastName?.trim() || null,
    passwordHash: hashPassword(parsed.data.password),
  });

  if (!otp) {
    logger.error({ email }, "Failed to generate OTP during registration");
    res.status(500).json({ error: "Failed to send verification email" });
    return;
  }

  const sent = await sendOtpEmail(email, otp);
  if (!sent) {
    logger.error({ email }, "Failed to send OTP email during registration");
    res.status(500).json({ error: "Failed to send verification email" });
    return;
  }

  logger.info({ email }, "User registered, OTP sent for verification");
  res.status(201).json({
    success: true,
    message: "Account created. Please verify your email with the OTP sent to your inbox.",
  });
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = validateCredentials(req.body, false);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const [userRow] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!userRow?.passwordHash || !verifyPassword(parsed.data.password, userRow.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Check if email is verified
  if (!userRow.verified) {
    logger.warn({ email }, "Login attempt with unverified email");
    // Send OTP for verification
    const otp = await createOtp(email);
    if (otp) {
      await sendOtpEmail(email, otp);
      res.status(403).json({
        error: "Please verify your email first",
        message: "An OTP has been sent to your email. Verify it to proceed.",
      });
      return;
    }
    res.status(403).json({ error: "Please verify your email first" });
    return;
  }

  const user = mapUser(userRow);
  const sid = await createAuthedSession(user);
  setSessionCookie(res, sid);
  res.json({ user });
});

router.post("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(`${frontendUrl}${returnTo}`);
});

function validateCredentials(
  body: unknown,
  includeName: boolean,
):
  | { success: true; data: AuthCredentials }
  | { success: false; error: string } {
  if (!body || typeof body !== "object") {
    return { success: false, error: "Missing request body" };
  }

  const candidate = body as Partial<AuthCredentials>;
  const email = typeof candidate.email === "string" ? candidate.email.trim() : "";
  const password = typeof candidate.password === "string" ? candidate.password : "";

  if (!email || !password) {
    return { success: false, error: "Email and password are required" };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { success: false, error: "Invalid email format" };
  }

  if (password.length < 8 || password.length > 64) {
    return { success: false, error: "Password must be 8-64 characters" };
  }

  if (includeName) {
    const firstName = candidate.firstName?.trim();
    if (!firstName) {
      return { success: false, error: "First name is required" };
    }
    if (!NAME_PATTERN.test(firstName)) {
      return { success: false, error: "First name contains invalid characters" };
    }
    const lastName = candidate.lastName?.trim();
    if (lastName && !NAME_PATTERN.test(lastName)) {
      return { success: false, error: "Last name contains invalid characters" };
    }
    return {
      success: true,
      data: {
        email,
        password,
        firstName,
        lastName,
      },
    };
  }

  return {
    success: true,
    data: {
      email,
      password,
    },
  };
}

router.post("/send-otp", authRateLimiter, async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  // Fetch previous registration data if any
  const [existingOtp] = await db.select().from(otpTable).where(eq(otpTable.email, email));
  const registrationData = existingOtp?.registrationData || undefined;

  const otp = await createOtp(email, registrationData as any);
  if (!otp) {
    res.status(500).json({ error: "Failed to generate OTP" });
    return;
  }

  const sent = await sendOtpEmail(email, otp);
  if (!sent) {
    res.status(500).json({ error: "Failed to send OTP email" });
    return;
  }

  res.json({ success: true, message: "OTP sent to your email" });
});

router.post("/verify-otp", authRateLimiter, async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";

  if (!email || !otp) {
    res.status(400).json({ error: "Email and OTP are required" });
    return;
  }
  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }
  if (!OTP_PATTERN.test(otp)) {
    res.status(400).json({ error: "OTP must be 6 digits" });
    return;
  }

  const record = await verifyOtp(email, otp);
  if (!record) {
    res.status(401).json({ error: "Invalid or expired OTP" });
    return;
  }

  // Check if we need to insert the user or update them
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user && record.registrationData) {
    const data = record.registrationData as any;
    const [created] = await db.insert(usersTable).values({
      id: crypto.randomUUID(),
      email,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      profileImageUrl: data.profileImageUrl || null,
      passwordHash: data.passwordHash || null,
      verified: true,
      emailVerifiedAt: new Date(),
    }).returning();

    if (!created) {
      res.status(500).json({ error: "Failed to create user account" });
      return;
    }
    user = created;
  } else if (user && !user.verified) {
    const [updated] = await db
      .update(usersTable)
      .set({
        verified: true,
        emailVerifiedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id))
      .returning();
      
    if (!updated) {
      res.status(500).json({ error: "Failed to verify email" });
      return;
    }
    user = updated;
  } else if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Create session
  const authUser = mapUser(user);
  const sid = await createAuthedSession(authUser);
  setSessionCookie(res, sid);

  logger.info({ email }, "Email verified and user logged in");
  res.json({
    success: true,
    message: "Email verified successfully. You are now logged in.",
    user: authUser,
  });
});

export default router;