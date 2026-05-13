import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, patientsTable } from "@workspace/db";
import {
  GetPublicClinicParams,
  GetPublicTrackingParams,
} from "@workspace/api-zod";
import {
  loadClinicBySlug,
  reminderStageFor,
  buildSerializedQueue,
} from "../lib/queue";

const router: IRouter = Router();

router.get("/public/clinics/:slug", async (req, res): Promise<void> => {
  const params = GetPublicClinicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const clinic = await loadClinicBySlug(params.data.slug);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  res.json({
    id: clinic.id,
    slug: clinic.slug,
    name: clinic.name,
    doctorName: clinic.doctorName,
    whatsappNumber: clinic.whatsappNumber,
    avgConsultationMinutes: clinic.avgConsultationMinutes,
  });
});
 
router.get("/public/queue/:trackingCode", async (req, res): Promise<void> => {
  const params = GetPublicTrackingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [patient] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.trackingCode, params.data.trackingCode));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  const clinic = await db.query.clinicsTable.findFirst({
    where: (c, { eq }) => eq(c.id, patient.clinicId),
  });
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const queue = await buildSerializedQueue(
    clinic.id,
    clinic.avgConsultationMinutes,
  );
  const me = queue.find((p) => p.id === patient.id);
  const current = queue.find((p) => p.status === "in_progress");
  let position = me?.position ?? -1;
  let patientsAhead = 0;
  let estimatedWaitMinutes = 0;
  let stage = me?.reminderStage ?? "done";
  let status = patient.status;
  if (me) {
    status = me.status;
    if (status === "in_progress") {
      patientsAhead = 0;
      estimatedWaitMinutes = 0;
    } else {
      patientsAhead = position - (current ? 1 : 0);
      if (patientsAhead < 0) patientsAhead = 0;
      estimatedWaitMinutes = position * clinic.avgConsultationMinutes;
    }
  } else {
    position = -1;
    patientsAhead = 0;
    estimatedWaitMinutes = 0;
    stage = reminderStageFor(patient.status, -1);
  }
  res.json({
    clinicName: clinic.name,
    doctorName: clinic.doctorName,
    tokenNumber: patient.tokenNumber,
    status,
    position,
    patientsAhead,
    estimatedWaitMinutes,
    currentTokenNumber: current?.tokenNumber ?? null,
    reminderStage: stage,
    avgConsultationMinutes: clinic.avgConsultationMinutes,
    totalToday: queue.length,
    completedToday: queue.filter(p => p.status === "done").length,
    clinicWhatsappNumber: clinic.whatsappNumber,
    clinicAddress: clinic.clinicAddress,
  });
});

export default router;
