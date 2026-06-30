import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, patientsTable } from "@workspace/db";
import {
  AddPatientToQueueBody,
  RemovePatientParams,
  ReorderQueueBody,
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
import { checkAppointmentEligibility } from "../lib/eligibility";
// WhatsApp/Twilio notification implementation disabled. Kept commented so it can be restored later.
// import {
//   sendWhatsAppMessage,
//   notifyNearbyPatientsOnChange,
//   buildConfirmationMessage,
//   trackNotificationSent,
//   buildNotificationMessage,
//   buildThankYouMessage,
//   shouldSendNotification,
// } from "../lib/notifications";

const router: IRouter = Router();

router.get("/patients/eligibility", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  try {
    const result = await checkAppointmentEligibility(clinic.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Eligibility check failed" });
  }
});

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
  const eligibility = await checkAppointmentEligibility(clinic.id);
  if (eligibility.outsideShiftHours && !parsed.data.allowOutsideShift) {
    res.status(409).json({
      error: "Outside shift hours",
      reason: eligibility.reason,
      outsideShiftHours: true,
    });
    return;
  }
  const activeQueue = await loadActiveQueueOrdered(clinic.id);
  const hasActive = activeQueue.some((p) => p.status === "in_progress" || p.status === "waiting");
  const initialStatus = hasActive ? "waiting" : "in_progress";
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
      status: initialStatus,
    })
    .returning();
  const queue = await buildSerializedQueue(
    clinic.id,
    clinic.avgConsultationMinutes,
  );
  const fresh = queue.find((p) => p.id === row!.id);
  const position = fresh?.position ?? queue.length - 1;
  const estimatedWaitMinutes = fresh?.estimatedWaitMinutes ?? position * clinic.avgConsultationMinutes;
  
  // WhatsApp/Twilio confirmation disabled. Kept commented so it can be restored later.
  // const msg = buildConfirmationMessage(
  //   clinic,
  //   parsed.data.name,
  //   tokenNumber,
  //   estimatedWaitMinutes,
  //   position,
  //   row!.trackingCode
  // );
  //
  // // confirmation to manually added patient
  // void sendWhatsAppMessage(parsed.data.phone, msg)
  //   .then((success) => {
  //     if (success) void trackNotificationSent(row!.id, "confirmation");
  //   })
  //   .catch(() => undefined);
  // // notify nearby patients asynchronously
  // void notifyNearbyPatientsOnChange(clinic.id);
  res.status(201).json(fresh ?? serialize(row!, 0, clinic.avgConsultationMinutes));
});

router.post("/patients/reorder", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const parsed = ReorderQueueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ordered = await loadActiveQueueOrdered(clinic.id);
  const inProgress = ordered.find((p) => p.status === "in_progress");
  const waiting = ordered.filter((p) => p.status === "waiting");
  const waitingIds = new Set(waiting.map((p) => p.id));
  const incomingIds = parsed.data.orderedIds;

  if (incomingIds.length !== waiting.length) {
    res.status(400).json({ error: "orderedIds must include all waiting patients." });
    return;
  }
  for (const id of incomingIds) {
    if (!waitingIds.has(id)) {
      res.status(400).json({ error: "orderedIds contains invalid patient ids." });
      return;
    }
  }

  const baseToken = (inProgress?.tokenNumber ?? 0) + 1;
  await db.transaction(async (tx) => {
    for (let i = 0; i < incomingIds.length; i += 1) {
      await tx
        .update(patientsTable)
        .set({ tokenNumber: baseToken + i })
        .where(and(eq(patientsTable.id, incomingIds[i]!), eq(patientsTable.clinicId, clinic.id)));
    }
  });

  // WhatsApp/Twilio queue-change notifications disabled.
  // void notifyNearbyPatientsOnChange(clinic.id);
  const queue = await buildSerializedQueue(
    clinic.id,
    clinic.avgConsultationMinutes,
  );
  res.json(queue);
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

    // WhatsApp/Twilio completion notification disabled. Kept commented so it can be restored later.
    // if (completedRow?.phone) {
    //   const canSend = await shouldSendNotification(completedRow.id, "done");
    //   if (canSend) {
    //     const msg = buildThankYouMessage(clinic, completedRow.name);
    //     void sendWhatsAppMessage(completedRow.phone, msg).then((success) => {
    //       if (success) void trackNotificationSent(completedRow!.id, "done");
    //     }).catch(() => undefined);
    //   }
    // }
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
  // WhatsApp/Twilio queue-change notifications disabled. Kept commented so they can be restored later.
  // // notify nearby patients after advancing
  // void notifyNearbyPatientsOnChange(clinic.id);
  //
  // // notify the new current patient directly (your turn)
  // if (currentRow?.phone) {
  //   const queueForCurrent = await buildSerializedQueue(clinic.id, clinic.avgConsultationMinutes);
  //   const pCurrent = queueForCurrent.find(p => p.id === currentRow!.id);
  //   if (pCurrent) {
  //     const msg = buildNotificationMessage(clinic, pCurrent);
  //     void sendWhatsAppMessage(currentRow.phone, msg)
  //       .then((success) => {
  //         if (success) void trackNotificationSent(currentRow!.id, "your_turn");
  //       }).catch(() => undefined);
  //   }
  // }

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
  // WhatsApp/Twilio queue-change notifications disabled.
  // void notifyNearbyPatientsOnChange(clinic.id);

  res.json(serialize(updated, -1, clinic.avgConsultationMinutes));
});

export default router;
