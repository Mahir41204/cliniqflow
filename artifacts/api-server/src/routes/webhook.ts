import { Router, type IRouter } from "express";
import { eq, or } from "drizzle-orm";
import { db, patientsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Ensure phone number matches what's in the DB (basic sanitization)
function normalizePhone(phone: string): string {
  const p = phone.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) return p;
  return `+${p}`; // assume missing plus
}

router.post("/public/whatsapp/webhook", async (req, res): Promise<void> => {
  // Acknowledge immediately to avoid provider retries
  res.status(200).send("OK");

  try {
    const { body } = req;
    
    // Support both Twilio and Meta payload formats
    let from = "";
    let messageBody = "";

    if (body.Body && body.From) {
      // Twilio format
      from = body.From.replace("whatsapp:", "");
      messageBody = body.Body.trim().toUpperCase();
    } else if (
      body.object === "whatsapp_business_account" &&
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    ) {
      // Meta format
      const msg = body.entry[0].changes[0].value.messages[0];
      from = msg.from;
      messageBody = msg.text?.body?.trim().toUpperCase() || "";
    }

    if (!from || !messageBody) {
      return;
    }

    const normalizedFrom = normalizePhone(from);

    // Find the patient in the queue
    const patient = await db.query.patientsTable.findFirst({
      where: (p, { eq, and, ne }) => 
        and(
          or(
            eq(p.phone, normalizedFrom),
            eq(p.phone, normalizedFrom.replace("+", "")) // In case DB has no +
          ),
          ne(p.status, "done"),
          ne(p.status, "skipped")
        ),
      orderBy: (p, { desc }) => [desc(p.createdAt)], // most recent
    });

    if (!patient) {
      logger.info({ from }, "Webhook received message from unknown number");
      return;
    }

    if (["STOP", "UNSUBSCRIBE", "CANCEL"].includes(messageBody)) {
      await db
        .update(patientsTable)
        .set({ whatsappOptIn: false })
        .where(eq(patientsTable.id, patient.id));
      
      logger.info({ patientId: patient.id }, "Patient opted out of notifications");
      // Could send an acknowledgment message here
    } else if (["START", "JOIN", "RESUME"].includes(messageBody)) {
      await db
        .update(patientsTable)
        .set({ whatsappOptIn: true })
        .where(eq(patientsTable.id, patient.id));
      
      logger.info({ patientId: patient.id }, "Patient opted in to notifications");
    }

  } catch (err) {
    logger.error({ err }, "Failed to process WhatsApp webhook");
  }
});

export default router;
