import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { buildSerializedQueue, type QueuePatient, type ReminderStage } from "../lib/queue";
import { db, clinicsTable, patientsTable, type Clinic } from "@workspace/db";

type TwilioContentVariables = Record<string, string | number | boolean | null | undefined>;

type WhatsAppMessageOptions = {
  contentSid?: string;
  contentVariables?: TwilioContentVariables;
};

function normalizePhone(phone: string): string {
  const p = phone.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) return p;
  return p; // assume international already provided, otherwise user must provide +country
}

function buildTwilioPayload(
  to: string,
  body: string,
  options: WhatsAppMessageOptions,
): URLSearchParams {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    throw new Error("Twilio not configured");
  }
  const params = new URLSearchParams();
  params.append("To", `whatsapp:${to}`);
  params.append("From", `whatsapp:${from}`);
  const contentSid = options.contentSid || process.env.TWILIO_WHATSAPP_CONTENT_SID || process.env.TWILIO_CONTENT_SID;
  if (contentSid) {
    params.append("ContentSid", contentSid);
    const contentVariables = options.contentVariables || { body };
    params.append("ContentVariables", JSON.stringify(contentVariables));
  } else {
    params.append("Body", body);
  }
  return params;
}

async function sendViaTwilio(to: string, body: string, options: WhatsAppMessageOptions = {}): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !process.env.TWILIO_WHATSAPP_FROM) {
    logger.warn({ sid: !!sid, token: !!token, from: !!process.env.TWILIO_WHATSAPP_FROM }, "Twilio not configured");
    return false;
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = buildTwilioPayload(to, body, options);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(sid + ":" + token).toString("base64")}`,
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

async function sendViaMeta(phoneNumberId: string, token: string, to: string, body: string): Promise<boolean> {
  if (!phoneNumberId || !token) {
    logger.warn({ phoneNumberId: !!phoneNumberId, token: !!token }, "Meta WhatsApp not configured");
    return false;
  }
  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error({ status: res.status, body: text }, "Meta WhatsApp send failed");
    return false;
  }
  return true;
}

export async function sendWhatsAppMessage(
  recipientPhone: string,
  message: string,
  options: WhatsAppMessageOptions = {},
): Promise<boolean> {
  const to = normalizePhone(recipientPhone);
  const provider = process.env.WHATSAPP_PROVIDER || process.env.WHATSAPP_API_PROVIDER || "meta";
  try {
    if (provider === "twilio") {
      return await sendViaTwilio(to, message, options);
    }
    // default to Meta / WhatsApp Cloud API
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_NUMBER_ID;
    const token = process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_TOKEN;
    return await sendViaMeta(phoneNumberId ?? "", token ?? "", to, message);
  } catch (err) {
    logger.error({ err }, "sendWhatsAppMessage threw");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Notification deduplication & tracking
// ---------------------------------------------------------------------------

export function buildTrackingUrl(trackingCode: string): string {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${frontendUrl}/track/${trackingCode}`;
}

/**
 * Check if a notification should be sent for a patient at a given stage.
 * Returns false if:
 * - Patient has opted out of WhatsApp
 * - This stage was already sent
 * - Less than 30 seconds since last notification
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

  // Check if already sent
  const sent = patient.notificationsSent ?? [];
  if (sent.includes(stage)) return false;

  // Check rate limit (30 seconds minimum between messages)
  if (patient.lastNotificationSent) {
    const timeSinceLastMs = Date.now() - patient.lastNotificationSent.getTime();
    if (timeSinceLastMs < 30000) return false;
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

  const updatedStages = [...(patient.notificationsSent ?? []), stage];

  await db
    .update(patientsTable)
    .set({
      notificationsSent: updatedStages,
      lastNotificationSent: new Date(),
    })
    .where(eq(patientsTable.id, patientId));
}

// ---------------------------------------------------------------------------
// Rich notification message builder
// ---------------------------------------------------------------------------

export function buildNotificationMessage(
  clinic: Clinic,
  patient: QueuePatient,
): string {
  const trackingUrl = buildTrackingUrl(patient.trackingCode);

  switch (patient.reminderStage) {
    case "three_away":
      return (
        `📢 Queue Update - ${clinic.name}\n\n` +
        `Hi ${patient.name},\n` +
        `You're getting close! 3 patients ahead of you.\n\n` +
        `🎫 Your Token: #${patient.tokenNumber}\n` +
        `⏳ Estimated Wait: ~${patient.estimatedWaitMinutes} minutes\n\n` +
        `Please stay nearby. Track live:\n${trackingUrl}`
      );

    case "two_away":
      return (
        `⚡ Almost Your Turn - ${clinic.name}\n\n` +
        `${patient.name}, you're 2nd in line!\n\n` +
        `🎫 Token: #${patient.tokenNumber}\n` +
        `⏳ Wait: ~${patient.estimatedWaitMinutes} minutes\n\n` +
        `Please be ready to come in shortly.\n${trackingUrl}`
      );

    case "one_away":
      return (
        `🔔 You're Next! - ${clinic.name}\n\n` +
        `${patient.name}, you're next in line.\n\n` +
        `🎫 Token: #${patient.tokenNumber}\n\n` +
        `⚠️ Please come to the reception NOW.\n` +
        `The doctor will see you very soon.`
      );

    case "your_turn":
      return (
        `🚨 PLEASE COME NOW - ${clinic.name}\n\n` +
        `${patient.name}, it's YOUR TURN!\n\n` +
        `🎫 Token: #${patient.tokenNumber}\n` +
        `👨‍⚕️ Dr. ${clinic.doctorName} is ready to see you.\n\n` +
        `➡️ Please proceed to the consultation room immediately.`
      );

    default:
      return "";
  }
}

/**
 * Build the enhanced initial confirmation message.
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
    `Hello ${patientName} 👋\n` +
    `Your appointment has been confirmed.\n\n` +
    `🏥 Clinic: ${clinic.name}\n` +
    `👨‍⚕️ Dr. ${clinic.doctorName}\n` +
    `🎫 Token Number: ${tokenNumber}\n` +
    `⏳ Estimated Wait Time: ${estimatedWaitMinutes} mins\n` +
    `👥 Patients Ahead: ${patientsAhead}\n\n` +
    `📍 Live Queue Tracking:\n${trackingUrl}\n\n` +
    `🔔 We will notify you when:\n` +
    `• 3 patients are ahead of you\n` +
    `• 2 patients are ahead of you\n` +
    `• You're next in line\n` +
    `• It's your turn - please come immediately\n\n` +
    `Reply STOP to unsubscribe from notifications.`
  );
}

// ---------------------------------------------------------------------------
// Notify nearby patients on queue change (with deduplication)
// ---------------------------------------------------------------------------

export async function notifyNearbyPatientsOnChange(clinicId: string): Promise<void> {
  try {
    const clinic = await db.query.clinicsTable.findFirst({ where: (c, { eq }) => eq(c.id, clinicId) });
    if (!clinic) return;
    const queue = await buildSerializedQueue(clinicId, clinic.avgConsultationMinutes);
    // notify positions: three_away, two_away, one_away, and your_turn
    const toNotify = queue.filter((p) => ["three_away", "two_away", "one_away", "your_turn"].includes(p.reminderStage));
    await Promise.all(
      toNotify.map(async (p) => {
        if (!p.phone) return;

        // Deduplication: check if we should send this notification
        const canSend = await shouldSendNotification(p.id, p.reminderStage);
        if (!canSend) return;

        const text = buildNotificationMessage(clinic, p);
        if (!text) return;

        const success = await sendWhatsAppMessage(p.phone, text, {
          contentVariables: {
            clinicName: clinic.name,
            doctorName: clinic.doctorName,
            tokenNumber: p.tokenNumber,
            estimatedWaitMinutes: p.estimatedWaitMinutes,
            reminderStage: p.reminderStage,
            message: text,
          },
        }).catch(() => false);

        // Track the notification regardless of success to avoid spamming
        if (success) {
          await trackNotificationSent(p.id, p.reminderStage);
        }
      }),
    );
  } catch (err) {
    logger.error({ err }, "notifyNearbyPatientsOnChange failed");
  }
}
