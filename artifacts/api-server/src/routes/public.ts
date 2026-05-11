import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, patientsTable } from "@workspace/db";
import {
  GetPublicClinicParams,
  GetPublicTrackingParams,
  PublicJoinQueueBody,
  PublicJoinQueueParams,
} from "@workspace/api-zod";
import {
  buildSerializedQueue,
  generateTrackingCode,
  loadClinicBySlug,
  nextTokenNumber,
  reminderStageFor,
} from "../lib/queue";
import { sendWhatsAppMessage, notifyNearbyPatientsOnChange } from "../lib/notifications";

const router: IRouter = Router();

function buildTrackingUrl(req: Express.Request, trackingCode: string): string {
  const proto =
    (req as unknown as { headers: Record<string, string | string[] | undefined> })
      .headers["x-forwarded-proto"] || "https";
  const host =
    (req as unknown as { headers: Record<string, string | string[] | undefined> })
      .headers.host || "";
  const protoStr = Array.isArray(proto) ? proto[0] : proto;
  const hostStr = Array.isArray(host) ? host[0] : host;
  return `${protoStr}://${hostStr}/track/${trackingCode}`;
}

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
 
router.post("/public/clinics/:slug/join", async (req, res): Promise<void> => {
  const params = PublicJoinQueueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = PublicJoinQueueBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const clinic = await loadClinicBySlug(params.data.slug);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  const tokenNumber = await nextTokenNumber(clinic.id);
  const trackingCode = generateTrackingCode();
  await db.insert(patientsTable).values({
    id: crypto.randomUUID(),
    clinicId: clinic.id,
    name: body.data.name,
    phone: body.data.phone,
    tokenNumber,
    trackingCode,
    status: "waiting",
  });
  const queue = await buildSerializedQueue(
    clinic.id,
    clinic.avgConsultationMinutes,
  );
  const me = queue.find((p) => p.trackingCode === trackingCode);
  const position = me?.position ?? queue.length - 1;
  const estimatedWaitMinutes =
    me?.estimatedWaitMinutes ?? position * clinic.avgConsultationMinutes;
  const trackingUrl = buildTrackingUrl(req, trackingCode);
  const confirmationMessage =
    `${clinic.name}\nDr. ${clinic.doctorName}\nYour token: #${tokenNumber}\n` +
    `Estimated wait: ${estimatedWaitMinutes} min\n` +
    `Live tracking: ${trackingUrl}`;

  void sendWhatsAppMessage(body.data.phone, confirmationMessage, {
    contentVariables: {
      clinicName: clinic.name,
      doctorName: clinic.doctorName,
      tokenNumber,
      estimatedWaitMinutes,
      trackingUrl,
      message: confirmationMessage,
    },
  }).catch(() => undefined);
  void notifyNearbyPatientsOnChange(clinic.id).catch(() => undefined);

  res.status(201).json({
    clinicName: clinic.name,
    doctorName: clinic.doctorName,
    tokenNumber,
    estimatedWaitMinutes,
    position,
    trackingCode,
    trackingUrl,
    whatsappConfirmationMessage: confirmationMessage,
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
  });
});

export default router;
