import fs from "fs";
import nodemailer from "nodemailer";

function parseDotenv(path) {
  const txt = fs.readFileSync(path, "utf8");
  const lines = txt.split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const idx = l.indexOf("=");
    if (idx === -1) continue;
    const key = l.slice(0, idx);
    const val = l.slice(idx + 1);
    out[key] = val;
  }
  return out;
}

const env = parseDotenv("../../.env");
const recipient = process.argv[2];
if (!recipient) {
  console.error("Usage: node scripts/send-test-otp.mjs recipient@example.com");
  process.exit(1);
}

const host = env.BREVO_SMTP_HOST;
const port = Number(env.BREVO_SMTP_PORT || 587);
const user = env.BREVO_SMTP_USER;
const pass = env.BREVO_SMTP_PASS;
const senderEmail = env.BREVO_SENDER_EMAIL || user;
const senderName = env.BREVO_SENDER_NAME || "Clinic Queue Manager";

if (!host || !user || !pass) {
  console.error("Missing SMTP configuration in .env");
  process.exit(1);
}

function generateOtp() {
  return Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
}

const otp = generateOtp();
const html = `\n  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n    <h2 style="color: #333;">Test OTP</h2>\n    <p style="color: #666;">Your one-time password (OTP) is:</p>\n    <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">\n      <h1 style="color: #007bff; letter-spacing: 5px; margin: 0;">${otp}</h1>\n    </div>\n    <p style="color: #666;">This OTP is for testing delivery.</p>\n  </div>\n`;

async function send() {
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `${senderName} <${senderEmail}>`,
      to: recipient,
      subject: "Clinic Queue Manager — Test OTP",
      html,
    });

    console.log("Message sent:", info.messageId || info);
  } catch (err) {
    console.error("Failed to send:", err);
    process.exit(2);
  }
}

send();
