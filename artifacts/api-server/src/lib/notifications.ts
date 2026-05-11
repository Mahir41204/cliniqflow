import { logger } from "./logger";
import { buildSerializedQueue } from "../lib/queue";
import { db, clinicsTable } from "@workspace/db";

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

export async function notifyNearbyPatientsOnChange(clinicId: string): Promise<void> {
  try {
    const clinic = await db.query.clinicsTable.findFirst({ where: (c, { eq }) => eq(c.id, clinicId) });
    if (!clinic) return;
    const queue = await buildSerializedQueue(clinicId, clinic.avgConsultationMinutes);
    // notify positions: three_away, two_away, one_away, and in_progress
    const toNotify = queue.filter((p) => ["three_away", "two_away", "one_away", "your_turn"].includes(p.reminderStage));
    await Promise.all(
      toNotify.map(async (p) => {
        if (!p.phone) return;
        let text = "";
        switch (p.reminderStage) {
          case "three_away":
            text = `${clinic.name}\nDr. ${clinic.doctorName}\nYou're 3 away from your turn. Estimated wait: ${p.estimatedWaitMinutes} min. Token: #${p.tokenNumber}`;
            break;
          case "two_away":
            text = `${clinic.name}\nDr. ${clinic.doctorName}\nYou're 2 away. Estimated wait: ${p.estimatedWaitMinutes} min. Token: #${p.tokenNumber}`;
            break;
          case "one_away":
            text = `${clinic.name}\nDr. ${clinic.doctorName}\nYou're next soon. Please be ready. Token: #${p.tokenNumber}`;
            break;
          case "your_turn":
            text = `${clinic.name}\nDr. ${clinic.doctorName}\nIt's your turn now. Please proceed to the reception. Token: #${p.tokenNumber}`;
            break;
        }
        if (text) {
          await sendWhatsAppMessage(p.phone, text, {
            contentVariables: {
              clinicName: clinic.name,
              doctorName: clinic.doctorName,
              tokenNumber: p.tokenNumber,
              estimatedWaitMinutes: p.estimatedWaitMinutes,
              reminderStage: p.reminderStage,
              message: text,
            },
          }).catch(() => undefined);
        }
      }),
    );
  } catch (err) {
    logger.error({ err }, "notifyNearbyPatientsOnChange failed");
  }
}
