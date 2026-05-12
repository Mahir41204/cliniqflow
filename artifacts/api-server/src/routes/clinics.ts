import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { db, clinicsTable } from "@workspace/db";
import {
  CreateMyClinicBody,
  UpdateMyClinicBody,
} from "@workspace/api-zod";
import {
  buildSerializedQueue,
  loadClinicByOwner,
  loadTodaysPatients,
  uniqueSlugFromName,
} from "../lib/queue";

const router: IRouter = Router();

function serializeClinic(row: typeof clinicsTable.$inferSelect) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    doctorName: row.doctorName,
    avgConsultationMinutes: row.avgConsultationMinutes,
    whatsappNumber: row.whatsappNumber,
    shiftStartTime: row.shiftStartTime,
    shiftEndTime: row.shiftEndTime,
    maxPatientsPerDay: row.maxPatientsPerDay,
    clinicAddress: row.clinicAddress,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/clinics/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  res.json({ clinic: clinic ? serializeClinic(clinic) : null });
});

router.post("/clinics", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateMyClinicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await loadClinicByOwner(req.user.id);
  if (existing) {
    res.status(400).json({ error: "Clinic already exists" });
    return;
  }
  const slug = await uniqueSlugFromName(parsed.data.name);
  const [created] = await db
    .insert(clinicsTable)
    .values({
      id: crypto.randomUUID(),
      ownerId: req.user.id,
      slug,
      name: parsed.data.name,
      doctorName: parsed.data.doctorName,
      avgConsultationMinutes: parsed.data.avgConsultationMinutes,
      whatsappNumber: parsed.data.whatsappNumber.replace(/[^0-9+]/g, ""),
      shiftStartTime: parsed.data.shiftStartTime ?? "09:00",
      shiftEndTime: parsed.data.shiftEndTime ?? "17:00",
      clinicAddress: parsed.data.clinicAddress,
    })
    .returning();
  res.status(201).json(serializeClinic(created!));
});

router.patch("/clinics/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpdateMyClinicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await loadClinicByOwner(req.user.id);
  if (!existing) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const update: Partial<typeof clinicsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.doctorName !== undefined)
    update.doctorName = parsed.data.doctorName;
  if (parsed.data.avgConsultationMinutes !== undefined)
    update.avgConsultationMinutes = parsed.data.avgConsultationMinutes;
  if (parsed.data.whatsappNumber !== undefined)
    update.whatsappNumber = parsed.data.whatsappNumber.replace(/[^0-9+]/g, "");
  if (parsed.data.shiftStartTime !== undefined)
    update.shiftStartTime = parsed.data.shiftStartTime;
  if (parsed.data.shiftEndTime !== undefined)
    update.shiftEndTime = parsed.data.shiftEndTime;
  if (parsed.data.maxPatientsPerDay !== undefined)
    update.maxPatientsPerDay = parsed.data.maxPatientsPerDay;
  if (parsed.data.clinicAddress !== undefined)
    update.clinicAddress = parsed.data.clinicAddress;

  const [updated] = await db
    .update(clinicsTable)
    .set(update)
    .where(eq(clinicsTable.id, existing.id))
    .returning();
  res.json(serializeClinic(updated!));
});

router.get("/clinics/me/stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const today = await loadTodaysPatients(clinic.id);
  const totalToday = today.length;
  const served = today.filter((p) => p.status === "done").length;
  const waiting = today.filter((p) => p.status === "waiting").length;
  const inProgress = today.filter((p) => p.status === "in_progress").length;
  const skipped = today.filter((p) => p.status === "skipped").length;

  let avgWaitMinutes = clinic.avgConsultationMinutes;
  const completedWithDuration = today.filter(
    (p) => p.status === "done" && p.completedAt,
  );
  if (completedWithDuration.length > 0) {
    const totalMins = completedWithDuration.reduce((acc, p) => {
      const ms = p.completedAt!.getTime() - p.createdAt.getTime();
      return acc + ms / 60000;
    }, 0);
    const sample = totalMins / completedWithDuration.length;
    if (sample > 0 && sample < 240) {
      avgWaitMinutes = Math.round(sample);
    }
  }

  const current = today.find((p) => p.status === "in_progress");
  const next = today
    .filter((p) => p.status === "waiting")
    .sort((a, b) => a.tokenNumber - b.tokenNumber)[0];

  res.json({
    totalToday,
    served,
    waiting,
    inProgress,
    skipped,
    avgWaitMinutes,
    currentTokenNumber: current?.tokenNumber ?? null,
    nextTokenNumber: next?.tokenNumber ?? null,
  });
});

router.get("/clinics/me/history", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clinic = await loadClinicByOwner(req.user.id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const today = await loadTodaysPatients(clinic.id);
  const queue = await buildSerializedQueue(
    clinic.id,
    clinic.avgConsultationMinutes,
  );
  const queueIds = new Set(queue.map((p) => p.id));
  const history = today
    .filter((p) => !queueIds.has(p.id))
    .map((row) => ({
      id: row.id,
      clinicId: row.clinicId,
      name: row.name,
      phone: row.phone,
      tokenNumber: row.tokenNumber,
      status: row.status,
      trackingCode: row.trackingCode,
      position: -1,
      estimatedWaitMinutes: 0,
      reminderStage: "done" as const,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    }));
  res.json(history);
});

export default router;
