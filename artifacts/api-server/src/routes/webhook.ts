import { Router, type IRouter } from "express";
/*
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, patientsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { normalizePhone } from "../lib/phone";
import { buildSerializedQueue } from "../lib/queue";
import {
  sendWhatsAppMessage,
  buildWalkInReplyMessage,
} from "../lib/notifications";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Twilio webhook signature validation
// ---------------------------------------------------------------------------
// Twilio signs every inbound request with HMAC-SHA1:
//   signature = Base64( HMAC-SHA1( authToken, url + sorted_POST_params ) )
// https://www.twilio.com/docs/usage/security#validating-signatures-from-twilio

function validateTwilioSignature(
  authToken: string,
  twilioSignature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  // Build the string to sign: url + alphabetically sorted key=value pairs
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  const data = url + paramString;

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(data, "utf8")
    .digest("base64");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(twilioSignature));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Inbound WhatsApp webhook (Twilio)
// ---------------------------------------------------------------------------
// Mounted at /webhooks/whatsapp (outside /api to avoid rate-limiter).
// Body is already parsed as urlencoded by the raw + urlencoded middleware in app.ts.

router.post("/whatsapp", async (req: Request, res: Response): Promise<void> => {
  // Acknowledge immediately to stop Twilio retries
  res.status(200).send("OK");

  try {
    // -----------------------------------------------------------------------
    // 1. Signature validation
    // -----------------------------------------------------------------------
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const skipSigCheck = process.env.SKIP_TWILIO_SIG_VALIDATION === "true";

    if (skipSigCheck) {
      // Only allow this in development — scream loudly in logs
      if (process.env.NODE_ENV !== "development") {
        logger.error("SKIP_TWILIO_SIG_VALIDATION is set in non-development environment — REFUSING");
        return;
      }
      logger.warn("⚠️  Twilio signature validation SKIPPED (dev mode) — never set this in production");
    } else if (!authToken) {
      logger.warn("TWILIO_AUTH_TOKEN not set — skipping signature check");
    } else {
      const twilioSignature = (req.headers["x-twilio-signature"] as string) || "";

      // Build the full URL Twilio signed. In production this must be the exact
      // public URL Twilio sends to, including https scheme.
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "";
      const fullUrl = `${protocol}://${host}${req.originalUrl}`;

      const bodyParams = req.body as Record<string, string>;

      if (!validateTwilioSignature(authToken, twilioSignature, fullUrl, bodyParams)) {
        logger.warn({ fullUrl }, "Twilio signature validation failed — dropping webhook");
        return;
      }
    }


    // -----------------------------------------------------------------------
    // 2. Parse Twilio body (application/x-www-form-urlencoded)
    // -----------------------------------------------------------------------
    const body = req.body as Record<string, string>;
    const rawFrom: string = body.From ?? "";
    const messageBody: string = (body.Body ?? "").trim();

    if (!rawFrom || !messageBody) return;

    // Strip the "whatsapp:" prefix Twilio adds to From/To
    const from = normalizePhone(rawFrom.replace(/^whatsapp:/i, ""));
    const command = messageBody.toUpperCase();

    // -----------------------------------------------------------------------
    // 3. Look up patient in queue by phone number
    //    - Only match active patients (not done/skipped)
    //    - Support both stored formats: +91XXXXXXXXXX and 91XXXXXXXXXX
    // -----------------------------------------------------------------------
    const fromWithoutPlus = from.replace(/^\+/, "");
    const fromWithPlus = from.startsWith("+") ? from : `+${from}`;

    const patient = await db.query.patientsTable.findFirst({
      where: (p, { and, or: orFn, ne }) =>
        and(
          orFn(
            eq(p.phone, fromWithPlus),
            eq(p.phone, fromWithoutPlus),
          ),
          ne(p.status, "done"),
          ne(p.status, "skipped"),
        ),
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    });

    if (!patient) {
      logger.info({ from }, "Webhook: message from unknown / inactive number — ignoring");
      return;
    }

    // -----------------------------------------------------------------------
    // 4. STOP / START command handling
    // -----------------------------------------------------------------------
    if (["STOP", "UNSUBSCRIBE", "CANCEL"].includes(command)) {
      await db
        .update(patientsTable)
        .set({ whatsappOptIn: false })
        .where(eq(patientsTable.id, patient.id));
      logger.info({ patientId: patient.id }, "Patient opted out of WhatsApp notifications");
      return;
    }

    if (["START", "JOIN", "RESUME"].includes(command)) {
      await db
        .update(patientsTable)
        .set({ whatsappOptIn: true })
        .where(eq(patientsTable.id, patient.id));
      logger.info({ patientId: patient.id }, "Patient opted back into WhatsApp notifications");
      return;
    }

    // -----------------------------------------------------------------------
    // 5. Any other message (e.g. "Hi") → reply with current queue card
    //    Only if patient has opted in
    // -----------------------------------------------------------------------
    if (patient.whatsappOptIn === false) {
      logger.info({ patientId: patient.id }, "Webhook: patient opted out — no reply sent");
      return;
    }

    // Fetch clinic to build the card
    const clinic = await db.query.clinicsTable.findFirst({
      where: (c, { eq: eqFn }) => eqFn(c.id, patient.clinicId),
    });
    if (!clinic) return;

    // Build serialized queue to get current position + wait time
    const queue = await buildSerializedQueue(clinic.id, clinic.avgConsultationMinutes);
    const me = queue.find((p) => p.id === patient.id);

    const tokenNumber = patient.tokenNumber;
    const estimatedWaitMinutes = me?.estimatedWaitMinutes ?? 0;
    const patientsAhead = me ? Math.max(me.position - (queue.some(p => p.status === "in_progress") ? 1 : 0), 0) : 0;

    const replyMsg = buildWalkInReplyMessage(
      clinic,
      patient.name,
      tokenNumber,
      estimatedWaitMinutes,
      patientsAhead,
      patient.trackingCode,
    );

    await sendWhatsAppMessage(from, replyMsg).catch(() => undefined);
    logger.info({ patientId: patient.id, from }, "Sent walk-in queue card reply");
  } catch (err) {
    logger.error({ err }, "Failed to process WhatsApp webhook");
  }
});

export default router;
*/

// Twilio/WhatsApp webhook implementation disabled. Original code is kept above
// in comments so it can be restored later.
const router: IRouter = Router();

export default router;
