import nodemailer from "nodemailer";

async function testSmtp() {
  console.log("Starting SMTP connection test...");
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: {
        user: "aae13e001@smtp-brevo.com",
        pass: "sF30Lc1EyUTtdCpj",
      },
    });

    console.log("1. Verifying connection to Brevo...");
    await transporter.verify();
    console.log("✅ Connection verified!");

    console.log("2. Attempting to send test email...");
    const info = await transporter.sendMail({
      from: '"Clinic Queue Manager" <aae13e001@smtp-brevo.com>',
      to: "pmahir2004@gmail.com", // Sending an email to itself as a test
      subject: "Test email from Clinic Queue",
      text: "If you are reading this, your SMTP connection is working perfectly.",
    });

    console.log("✅ Message successfully accepted by Brevo!");
    console.log("Message ID:", info.messageId);
    console.log("Please check the inbox (and spam folder) for aae13e001@smtp-brevo.com");
  } catch (error) {
    console.error("❌ Error during SMTP test:");
    console.error(error.message);
    if (error.responseCode) {
      console.error("Response Code:", error.responseCode);
    }
    if (error.command) {
      console.error("Failed Command:", error.command);
    }
  }
}

testSmtp();
