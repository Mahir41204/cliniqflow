import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { normalizePhone } from "./phone";
import { buildSerializedQueue, type QueuePatient, type ReminderStage } from "../lib/queue";
import { db, clinicsTable, patientsTable, type Clinic } from "@workspace/db";

// ---------------------------------------------------------------------------
// Twilio send (freeform text only — no ContentSid / templates)
// ---------------------------------------------------------------------------

async function sendViaTwilio(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    logger.warn(
      { sid: !!sid, token: !!token, from: !!from },
      "Twilio not configured — skipping WhatsApp send",
    );
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams();
  params.append("To", `whatsapp:${to}`);
  params.append("From", `whatsapp:${from}`);
  params.append("Body", body);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error({ status: res.status, body: text }, "Twilio send failed");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public send entry-point
// ---------------------------------------------------------------------------

export async function sendWhatsAppMessage(
  recipientPhone: string,
  message: string,
): Promise<boolean> {
  const to = normalizePhone(recipientPhone);
  try {
    return await sendViaTwilio(to, message);
  } catch (err) {
    logger.error({ err }, "sendWhatsAppMessage threw");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tracking URL helper
// ---------------------------------------------------------------------------

export function buildTrackingUrl(trackingCode: string): string {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${frontendUrl}/track/${trackingCode}`;
}

// ---------------------------------------------------------------------------
// Notification deduplication & tracking
// ---------------------------------------------------------------------------

/**
 * Returns false if:
 * - Patient not found
 * - Patient opted out
 * - This stage was already sent
 * - Less than 30 seconds since last notification (rate-limit)
 */
export async function shouldSendNotification(
  patientId: string,
  stage: ReminderStage,
): Promise<boolean> {
  const [patient] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId));

  if (!patient) return false;
  if (patient.whatsappOptIn === false) return false;

  const sent = patient.notificationsSent ?? [];
  if (sent.includes(stage)) return false;

  if (patient.lastNotificationSent) {
    const timeSinceLastMs = Date.now() - patient.lastNotificationSent.getTime();
    if (timeSinceLastMs < 30_000) return false;
  }

  return true;
}

/**
 * Record that a notification was sent for a given stage.
 */
export async function trackNotificationSent(
  patientId: string,
  stage: string,
): Promise<void> {
  const [patient] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId));

  if (!patient) return;

  await db
    .update(patientsTable)
    .set({
      notificationsSent: [...(patient.notificationsSent ?? []), stage],
      lastNotificationSent: new Date(),
    })
    .where(eq(patientsTable.id, patientId));
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

/**
 * Initial confirmation card sent when a patient is added to the queue.
 *
 * Format (per spec):
 *   Clinic name
 *   Doctor name
 *   Token no
 *   Est time
 *   Live link
 */
export function buildConfirmationMessage(
  clinic: Clinic,
  patientName: string,
  tokenNumber: number,
  estimatedWaitMinutes: number,
  patientsAhead: number,
  trackingCode: string,
): string {
  const trackingUrl = buildTrackingUrl(trackingCode);
  return (
    `Hello ${patientName}! 👋 You've been added to the queue.\n\n` +
    `🏥 ${clinic.name}\n` +
    `👨‍⚕️ Dr. ${clinic.doctorName}\n` +
    `🎫 Token No: #${tokenNumber}\n` +
    `⏳ Est. Wait: ~${estimatedWaitMinutes} mins` +
    (patientsAhead > 0 ? ` (${patientsAhead} ahead of you)` : "") +
    `\n\n📍 Track live:\n${trackingUrl}\n\n` +
    `We'll notify you when you're getting close. Reply STOP to opt out.`
  );
}

/**
 * Walk-in reply: sent when an in-queue patient sends "Hi" (or any non-command).
 * Same card format as confirmation.
 */
export function buildWalkInReplyMessage(
  clinic: Clinic,
  patientName: string,
  tokenNumber: number,
  estimatedWaitMinutes: number,
  patientsAhead: number,
  trackingCode: string,
): string {
  const trackingUrl = buildTrackingUrl(trackingCode);
  return (
    `Hi ${patientName}! 👋 Here's your current queue status:\n\n` +
    `🏥 ${clinic.name}\n` +
    `👨‍⚕️ Dr. ${clinic.doctorName}\n` +
    `🎫 Token No: #${tokenNumber}\n` +
    `⏳ Est. Wait: ~${estimatedWaitMinutes} mins` +
    (patientsAhead > 0 ? ` (${patientsAhead} ahead of you)` : " — you're next!") +
    `\n\n📍 Live tracking:\n${trackingUrl}`
  );
}

/**
 * Progress notification sent at 3/2/1 ahead and "your turn".
 */
export function buildNotificationMessage(
  clinic: Clinic,
  patient: QueuePatient,
): string {
  const trackingUrl = buildTrackingUrl(patient.trackingCode);

  switch (patient.reminderStage) {
    case "three_away":
      return (
        `📢 Queue Update — ${clinic.name}\n\n` +
        `Hi ${patient.name}, you're 3 patients away from your turn.\n\n` +
        `🏥 ${clinic.name}\n` +
        `👨‍⚕️ Dr. ${clinic.doctorName}\n` +
        `🎫 Token No: #${patient.tokenNumber}\n` +
        `⏳ Est. Wait: ~${patient.estimatedWaitMinutes} mins\n\n` +
        `📍 Track live:\n${trackingUrl}`
      );

    case "two_away":
      return (
        `⚡ Almost Your Turn — ${clinic.name}\n\n` +
        `Hi ${patient.name}, 2 patients ahead of you.\n\n` +
        `🏥 ${clinic.name}\n` +
        `👨‍⚕️ Dr. ${clinic.doctorName}\n` +
        `🎫 Token No: #${patient.tokenNumber}\n` +
        `⏳ Est. Wait: ~${patient.estimatedWaitMinutes} mins\n\n` +
        `📍 Track live:\n${trackingUrl}`
      );

    case "one_away":
      return (
        `🔔 You're Next! — ${clinic.name}\n\n` +
        `Hi ${patient.name}, you're 1 patient away.\n\n` +
        `🏥 ${clinic.name}\n` +
        `👨‍⚕️ Dr. ${clinic.doctorName}\n` +
        `🎫 Token No: #${patient.tokenNumber}\n\n` +
        `⚠️ Please come to the reception now.`
      );

    case "your_turn":
      return (
        `🚨 It's Your Turn! — ${clinic.name}\n\n` +
        `${patient.name}, please come in NOW.\n\n` +
        `🏥 ${clinic.name}\n` +
        `👨‍⚕️ Dr. ${clinic.doctorName} is ready to see you.\n` +
        `🎫 Token No: #${patient.tokenNumber}\n\n` +
        `➡️ Proceed to the consultation room immediately.`
      );

    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Batch notify nearby patients on any queue change (with deduplication)
// ---------------------------------------------------------------------------

export async function notifyNearbyPatientsOnChange(clinicId: string): Promise<void> {
  try {
    const clinic = await db.query.clinicsTable.findFirst({
      where: (c, { eq }) => eq(c.id, clinicId),
    });
    if (!clinic) return;

    const queue = await buildSerializedQueue(clinicId, clinic.avgConsultationMinutes);
    const toNotify = queue.filter((p) =>
      ["three_away", "two_away", "one_away", "your_turn"].includes(p.reminderStage),
    );

    await Promise.all(
      toNotify.map(async (p) => {
        if (!p.phone) return;

        const canSend = await shouldSendNotification(p.id, p.reminderStage);
        if (!canSend) return;

        const text = buildNotificationMessage(clinic, p);
        if (!text) return;

        const success = await sendWhatsAppMessage(p.phone, text).catch(() => false);

        if (success) {
          await trackNotificationSent(p.id, p.reminderStage);
        }
      }),
    );
  } catch (err) {
    logger.error({ err }, "notifyNearbyPatientsOnChange failed");
  }
}
