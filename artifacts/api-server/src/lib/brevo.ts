import { logger } from "./logger";
// @ts-ignore - Ignore missing types for nodemailer
import nodemailer from "nodemailer";

interface BrevoEmailRequest {
  to: Array<{ email: string; name?: string }>;
  sender: { name: string; email: string };
  subject: string;
  htmlContent: string;
}

function buildHtml(otp: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Verify your email</h2>
      <p style="color: #666;">Your one-time password (OTP) is:</p>
      <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <h1 style="color: #007bff; letter-spacing: 5px; margin: 0;">${otp}</h1>
      </div>
      <p style="color: #666;">This OTP will expire in 10 minutes.</p>
      <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
    </div>
  `;
}

export async function sendOtpEmail(to: string, otp: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.BREVO_SMTP_USER || "noreply@clinic.local";
  const senderName = process.env.BREVO_SENDER_NAME || "Clinic Queue Manager";

  const htmlContent = buildHtml(otp);

  // Prefer HTTP API when API key provided
  if (apiKey) {
    const payload: BrevoEmailRequest = {
      to: [{ email: to }],
      sender: { name: senderName, email: senderEmail },
      subject: "Verify your email - OTP",
      htmlContent,
    };

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        logger.error({ status: response.status, error }, "Brevo send email failed");
        return false;
      }

      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      logger.info({ to, provider: "brevo-http", response: data }, "OTP email accepted by provider");
      return true;
    } catch (err) {
      logger.error({ err, to }, "Brevo HTTP API sending threw");
      // fallthrough to try SMTP if configured
    }
  }

  // SMTP fallback
  const smtpHost = process.env.BREVO_SMTP_HOST;
  const smtpPort = Number(process.env.BREVO_SMTP_PORT || 587);
  const smtpUser = process.env.BREVO_SMTP_USER;
  const smtpPass = process.env.BREVO_SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    logger.warn("No Brevo HTTP API key or SMTP credentials configured");
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for other ports (STARTTLS)
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const info = await transporter.sendMail({
      from: `${senderName} <${senderEmail}>`,
      to,
      subject: "Verify your email - OTP",
      html: htmlContent,
    });

    const accepted = Array.isArray(info.accepted) && info.accepted.length > 0;
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];

    logger.info(
      {
        to,
        provider: "brevo-smtp",
        messageId: info.messageId,
        accepted: info.accepted,
        rejected,
        response: info.response,
      },
      "OTP email attempted via SMTP",
    );

    if (!accepted || rejected.length > 0) {
      logger.error({ to, messageId: info.messageId, rejected }, "SMTP provider did not accept recipient");
      return false;
    }

    return true;
  } catch (err) {
    logger.error({ err, message: (err as Error).message, to }, "Brevo SMTP sending threw");
    return false;
  }
}
