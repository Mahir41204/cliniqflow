import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, patientsTable, clinicsTable, type PatientRow } from "@workspace/db";

export type ReminderStage =
  | "none"
  | "three_away"
  | "two_away"
  | "one_away"
  | "your_turn"
  | "done";

export interface QueuePatient {
  id: string;
  clinicId: string;
  name: string;
  phone: string;
  tokenNumber: number;
  status: "waiting" | "in_progress" | "done" | "skipped";
  trackingCode: string;
  position: number;
  estimatedWaitMinutes: number;
  reminderStage: ReminderStage;
  createdAt: string;
  completedAt: string | null;
}

export function reminderStageFor(
  status: PatientRow["status"],
  position: number,
): ReminderStage {
  if (status === "done" || status === "skipped") return "done";
  if (status === "in_progress" || position === 0) return "your_turn";
  if (position === 1) return "one_away";
  if (position === 2) return "two_away";
  if (position === 3) return "three_away";
  return "none";
}

export function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function loadActiveQueue(clinicId: string): Promise<PatientRow[]> {
  const since = startOfTodayUtc();
  return db
    .select()
    .from(patientsTable)
    .where(
      and(
        eq(patientsTable.clinicId, clinicId),
        gte(patientsTable.createdAt, since),
        inArray(patientsTable.status, ["waiting", "in_progress"]),
      ),
    )
    .orderBy(patientsTable.tokenNumber);
}

export async function loadActiveQueueOrdered(
  clinicId: string,
): Promise<PatientRow[]> {
  const all = await loadActiveQueue(clinicId);
  return all.sort((a, b) => {
    const aIn = a.status === "in_progress" ? 0 : 1;
    const bIn = b.status === "in_progress" ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return a.tokenNumber - b.tokenNumber;
  });
}

export function serialize(
  row: PatientRow,
  position: number,
  avgConsultationMinutes: number,
): QueuePatient {
  const status = row.status;
  let estimatedWaitMinutes = 0;
  if (status === "waiting") {
    estimatedWaitMinutes = position * avgConsultationMinutes;
  } else if (status === "in_progress") {
    estimatedWaitMinutes = 0;
  }
  return {
    id: row.id,
    clinicId: row.clinicId,
    name: row.name,
    phone: row.phone,
    tokenNumber: row.tokenNumber,
    status,
    trackingCode: row.trackingCode,
    position,
    estimatedWaitMinutes,
    reminderStage: reminderStageFor(status, position),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function buildSerializedQueue(
  clinicId: string,
  avgConsultationMinutes: number,
): Promise<QueuePatient[]> {
  const ordered = await loadActiveQueueOrdered(clinicId);
  return ordered.map((row, idx) => serialize(row, idx, avgConsultationMinutes));
}

export async function findPatientPosition(
  clinicId: string,
  patientId: string,
): Promise<{
  row: PatientRow | null;
  position: number;
  currentTokenNumber: number | null;
}> {
  const ordered = await loadActiveQueueOrdered(clinicId);
  const idx = ordered.findIndex((p) => p.id === patientId);
  const current = ordered.find((p) => p.status === "in_progress");
  if (idx === -1) {
    // patient might be done/skipped — fetch directly
    const [row] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId));
    return {
      row: row ?? null,
      position: -1,
      currentTokenNumber: current?.tokenNumber ?? null,
    };
  }
  return {
    row: ordered[idx]!,
    position: idx,
    currentTokenNumber: current?.tokenNumber ?? null,
  };
}

export async function nextTokenNumber(clinicId: string): Promise<number> {
  const since = startOfTodayUtc();
  const [row] = await db
    .select({ max: sql<number | null>`max(${patientsTable.tokenNumber})` })
    .from(patientsTable)
    .where(
      and(
        eq(patientsTable.clinicId, clinicId),
        gte(patientsTable.createdAt, since),
      ),
    );
  return (row?.max ?? 0) + 1;
}

export async function loadClinicByOwner(ownerId: string) {
  const [row] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.ownerId, ownerId));
  return row ?? null;
}

export async function loadClinicBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.slug, slug));
  return row ?? null;
}

export function generateTrackingCode(): string {
  // 10-char base36 random
  return (
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 6)
  ).slice(0, 10);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export async function uniqueSlugFromName(name: string): Promise<string> {
  const base = slugify(name) || "clinic";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate =
      attempt === 0
        ? base
        : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const [existing] = await db
      .select({ id: clinicsTable.id })
      .from(clinicsTable)
      .where(eq(clinicsTable.slug, candidate));
    if (!existing) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function loadTodaysPatients(clinicId: string) {
  const since = startOfTodayUtc();
  return db
    .select()
    .from(patientsTable)
    .where(
      and(
        eq(patientsTable.clinicId, clinicId),
        gte(patientsTable.createdAt, since),
      ),
    )
    .orderBy(desc(patientsTable.createdAt));
}
