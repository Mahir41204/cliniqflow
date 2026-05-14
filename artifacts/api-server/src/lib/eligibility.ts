import { db, clinicsTable } from "@workspace/db";
import { loadActiveQueueOrdered } from "./queue";

export interface EligibilityResult {
  canGetAppointment: boolean;
  currentQueueLength: number;
  estimatedWaitMinutes: number;
  shiftEndTime: string;
  shiftStartTime: string;
  timeUntilShiftEnd: number;
  outsideShiftHours: boolean;
  breakMinutesAdded: number;
  effectiveBreaks: Array<{ start: string; end: string }>;
  reason: string | null;
}

type BreakRange = { start: string; end: string };

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseBreaks(raw?: string | null): BreakRange[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as BreakRange[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b) => typeof b?.start === "string" && typeof b?.end === "string")
      .filter((b) => b.start < b.end);
  } catch {
    return [];
  }
}

function buildBreakWindows(date: Date, breaks: BreakRange[]): Array<{ start: Date; end: Date }> {
  return breaks.map((b) => {
    const [sh, sm] = b.start.split(":").map(Number);
    const [eh, em] = b.end.split(":").map(Number);
    const start = new Date(date);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(date);
    end.setHours(eh, em, 0, 0);
    return { start, end };
  });
}

function overlapMinutes(rangeStart: Date, rangeEnd: Date, windows: Array<{ start: Date; end: Date }>): number {
  let minutes = 0;
  for (const w of windows) {
    const start = rangeStart > w.start ? rangeStart : w.start;
    const end = rangeEnd < w.end ? rangeEnd : w.end;
    if (end > start) {
      minutes += Math.ceil((end.getTime() - start.getTime()) / 60000);
    }
  }
  return minutes;
}

export async function checkAppointmentEligibility(
  clinicId: string,
): Promise<EligibilityResult> {
  const clinic = await db.query.clinicsTable.findFirst({
    where: (c, { eq }) => eq(c.id, clinicId),
  });

  if (!clinic) {
    throw new Error("Clinic not found");
  }

  const queue = await loadActiveQueueOrdered(clinicId);
  const currentQueueLength = queue.filter((p) => p.status === "waiting").length;

  const now = new Date();
  const estimatedQueueDuration =
    currentQueueLength * clinic.avgConsultationMinutes;

  const todayKey = localDateKey(now);
  const overrideApplies = clinic.overrideDate === todayKey;

  // Parse shift times (format: "HH:MM")
  const shiftStart = overrideApplies
    ? clinic.overrideShiftStartTime || clinic.shiftStartTime || "09:00"
    : clinic.shiftStartTime || "09:00";
  const shiftEnd = overrideApplies
    ? clinic.overrideShiftEndTime || clinic.shiftEndTime || "17:00"
    : clinic.shiftEndTime || "17:00";
  const [endHour, endMinute] = shiftEnd.split(":").map(Number);

  const shiftEndToday = new Date(now);
  shiftEndToday.setHours(endHour, endMinute, 0, 0);

  const timeUntilShiftEnd = Math.floor(
    (shiftEndToday.getTime() - now.getTime()) / 60000,
  );

  const effectiveBreaks = overrideApplies
    ? parseBreaks(clinic.overrideBreaks) || parseBreaks(clinic.defaultBreaks)
    : parseBreaks(clinic.defaultBreaks);

  const breakWindows = buildBreakWindows(now, effectiveBreaks);
  let projectedMinutes = estimatedQueueDuration + clinic.avgConsultationMinutes;
  let breakMinutesAdded = 0;
  for (let i = 0; i < 3; i += 1) {
    const projectedEnd = new Date(now.getTime() + projectedMinutes * 60000);
    const overlap = overlapMinutes(now, projectedEnd, breakWindows);
    if (overlap === breakMinutesAdded) break;
    breakMinutesAdded = overlap;
    projectedMinutes = estimatedQueueDuration + clinic.avgConsultationMinutes + breakMinutesAdded;
  }

  // Check if there's time for one more consultation
  const timeNeededForNewPatient = projectedMinutes;
  const canGetAppointment =
    timeUntilShiftEnd > 0 && timeNeededForNewPatient <= timeUntilShiftEnd;

  // Also check max patients per day
  const maxPatients = clinic.maxPatientsPerDay ?? 50;
  const { loadTodaysPatients } = await import("./queue");
  const todaysPatients = await loadTodaysPatients(clinicId);
  const totalToday = todaysPatients.length;
  const isUnderLimit = totalToday < maxPatients;

  const outsideShiftHours = timeUntilShiftEnd <= 0 || timeNeededForNewPatient > timeUntilShiftEnd;
  const eligible = canGetAppointment && isUnderLimit;

  let reason: string | null = null;
  if (!eligible) {
    if (!canGetAppointment) {
      reason = `Doctor's shift ends at ${shiftEnd}. Estimated queue finishes after shift hours.`;
    } else if (!isUnderLimit) {
      reason = `Maximum daily patient limit (${maxPatients}) reached.`;
    }
  }

  return {
    canGetAppointment: eligible,
    currentQueueLength,
    estimatedWaitMinutes: estimatedQueueDuration + breakMinutesAdded,
    shiftEndTime: shiftEnd,
    shiftStartTime: shiftStart,
    timeUntilShiftEnd: Math.max(0, timeUntilShiftEnd),
    outsideShiftHours,
    breakMinutesAdded,
    effectiveBreaks,
    reason,
  };
}
