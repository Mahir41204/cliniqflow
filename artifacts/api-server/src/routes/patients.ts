import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, patientsTable } from "@workspace/db";
import {
  AddPatientToQueueBody,
  RemovePatientParams,
  SkipPatientParams,
} from "@workspace/api-zod";
import {
  buildSerializedQueue,
  generateTrackingCode,
  loadClinicByOwner,
  loadActiveQueueOrdered,
  nextTokenNumber,
  serialize,
} from "../lib/queue";
import { sendWhatsAppMessage, notifyNearbyPatientsOnChange } from "../lib/notifications";

const router: IRouter = Router();

router.get("/patients", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const queue = await buildSerializedQueue(
    clinic.id,
    clinic.avgConsultationMinutes,
  );
  res.json(queue);
});

router.post("/patients", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const parsed = AddPatientToQueueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tokenNumber = await nextTokenNumber(clinic.id);
  const [row] = await db
    .insert(patientsTable)
    .values({
      id: crypto.randomUUID(),
      clinicId: clinic.id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      tokenNumber,
      trackingCode: generateTrackingCode(),
      status: "waiting",
    })
    .returning();
  const queue = await buildSerializedQueue(
    clinic.id,
    clinic.avgConsultationMinutes,
  );
  const fresh = queue.find((p) => p.id === row!.id);
  // confirmation to manually added patient
  void sendWhatsAppMessage(
    parsed.data.phone,
    `${clinic.name}\nDr. ${clinic.doctorName}\nYou were added to the queue. Token: #${tokenNumber}`,
    {
      contentVariables: {
        clinicName: clinic.name,
        doctorName: clinic.doctorName,
        tokenNumber,
        message: `You were added to the queue. Token: #${tokenNumber}`,
      },
    },
  ).catch(() => undefined);
  // notify nearby patients asynchronously
  void notifyNearbyPatientsOnChange(clinic.id);
  res.status(201).json(fresh ?? serialize(row!, 0, clinic.avgConsultationMinutes));
});

router.post("/patients/next", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const ordered = await loadActiveQueueOrdered(clinic.id);
  const inProgress = ordered.find((p) => p.status === "in_progress");
  let completedRow: typeof patientsTable.$inferSelect | null = null;
  if (inProgress) {
    const [updated] = await db
      .update(patientsTable)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(patientsTable.id, inProgress.id))
      .returning();
    completedRow = updated ?? null;
  }
  const remaining = ordered
    .filter((p) => p.id !== inProgress?.id && p.status === "waiting")
    .sort((a, b) => a.tokenNumber - b.tokenNumber);
  let currentRow: typeof patientsTable.$inferSelect | null = null;
  if (remaining.length > 0) {
    const next = remaining[0]!;
    const [updated] = await db
      .update(patientsTable)
      .set({ status: "in_progress" })
      .where(eq(patientsTable.id, next.id))
      .returning();
    currentRow = updated ?? null;
  }
  // notify nearby patients after advancing
  void notifyNearbyPatientsOnChange(clinic.id);

  // notify the new current patient directly (your turn)
  if (currentRow?.phone) {
    void sendWhatsAppMessage(
      currentRow.phone,
      `${clinic.name}\nDr. ${clinic.doctorName}\nIt's your turn now. Token: #${currentRow.tokenNumber}`,
      {
        contentVariables: {
          clinicName: clinic.name,
          doctorName: clinic.doctorName,
          tokenNumber: currentRow.tokenNumber,
          message: `It's your turn now. Token: #${currentRow.tokenNumber}`,
        },
      },
    ).catch(() => undefined);
  }

  res.json({
    completed: completedRow
      ? serialize(completedRow, -1, clinic.avgConsultationMinutes)
      : null,
    current: currentRow
      ? serialize(currentRow, 0, clinic.avgConsultationMinutes)
      : null,
  });
});

router.delete("/patients/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const params = RemovePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(patientsTable)
    .where(
      and(
        eq(patientsTable.id, params.data.id),
        eq(patientsTable.clinicId, clinic.id),
      ),
    );
  res.sendStatus(204);
});

router.post("/patients/:id/skip", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const params = SkipPatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [updated] = await db
    .update(patientsTable)
    .set({ status: "skipped", completedAt: new Date() })
    .where(
      and(
        eq(patientsTable.id, params.data.id),
        eq(patientsTable.clinicId, clinic.id),
      ),
    )
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  // notify nearby patients after skip
  void notifyNearbyPatientsOnChange(clinic.id);

  res.json(serialize(updated, -1, clinic.avgConsultationMinutes));
});

export default router;
