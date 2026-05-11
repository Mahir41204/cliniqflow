import crypto from "node:crypto";
import { db, otpTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { logger } from "./logger";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(OTP_LENGTH, "0");
}

export async function createOtp(email: string, registrationData?: Record<string, unknown>): Promise<string | null> {
  try {
    // Clean up old OTPs for this email
    await db.delete(otpTable).where(eq(otpTable.email, email));

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const [created] = await db
      .insert(otpTable)
      .values({
        id: crypto.randomUUID(),
        email,
        otp,
        attempts: 0,
        registrationData: registrationData ? (registrationData as any) : null,
        expiresAt,
      })
      .returning();

    if (!created) {
      logger.error({ email }, "Failed to create OTP record");
      return null;
    }

    if (process.env.NODE_ENV !== "production") {
      logger.info({ email, otp }, "OTP created (dev mode)");
    } else {
      logger.info({ email, expiresAt }, "OTP created");
    }
    return otp;
  } catch (err) {
    logger.error({ err, email }, "Failed to create OTP");
    return null;
  }
}

export async function verifyOtp(email: string, otp: string): Promise<typeof otpTable.$inferSelect | null> {
  try {
    const [record] = await db
      .select()
      .from(otpTable)
      .where(eq(otpTable.email, email));

    if (!record) {
      logger.warn({ email }, "OTP record not found");
      return null;
    }

    // Check if OTP is expired
    if (record.expiresAt < new Date()) {
      await db.delete(otpTable).where(eq(otpTable.id, record.id));
      logger.warn({ email }, "OTP expired");
      return null;
    }

    // Check if max attempts exceeded
    if (record.attempts >= MAX_ATTEMPTS) {
      await db.delete(otpTable).where(eq(otpTable.id, record.id));
      logger.warn({ email }, "Max OTP attempts exceeded");
      return null;
    }

    // Check if OTP matches
    if (record.otp !== otp) {
      // Increment attempts
      await db
        .update(otpTable)
        .set({ attempts: record.attempts + 1 })
        .where(eq(otpTable.id, record.id));

      logger.warn(
        { email, attempts: record.attempts + 1 },
        "OTP verification failed",
      );
      return null;
    }

    // OTP is valid, delete the record
    await db.delete(otpTable).where(eq(otpTable.id, record.id));
    logger.info({ email }, "OTP verified successfully");
    return record;
  } catch (err) {
    logger.error({ err, email }, "OTP verification threw");
    return null;
  }
}

export async function cleanupExpiredOtps(): Promise<void> {
  try {
    const now = new Date();
    const result = await db.delete(otpTable).where(lt(otpTable.expiresAt, now));
    logger.info("Cleaned up expired OTPs");
  } catch (err) {
    logger.error({ err }, "Failed to cleanup expired OTPs");
  }
}
