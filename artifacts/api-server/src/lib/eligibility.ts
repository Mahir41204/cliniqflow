import { db, clinicsTable } from "@workspace/db";
import { loadActiveQueueOrdered } from "./queue";

export interface EligibilityResult {
  canGetAppointment: boolean;
  currentQueueLength: number;
  estimatedWaitMinutes: number;
  shiftEndTime: string;
  shiftStartTime: string;
  timeUntilShiftEnd: number;
  reason: string | null;
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

  // Parse shift times (format: "HH:MM")
  const shiftStart = clinic.shiftStartTime || "09:00";
  const shiftEnd = clinic.shiftEndTime || "17:00";
  const [endHour, endMinute] = shiftEnd.split(":").map(Number);

  const shiftEndToday = new Date(now);
  shiftEndToday.setHours(endHour, endMinute, 0, 0);

  const timeUntilShiftEnd = Math.floor(
    (shiftEndToday.getTime() - now.getTime()) / 60000,
  );

  // Check if there's time for one more consultation
  const timeNeededForNewPatient =
    estimatedQueueDuration + clinic.avgConsultationMinutes;
  const canGetAppointment =
    timeUntilShiftEnd > 0 && timeNeededForNewPatient <= timeUntilShiftEnd;

  // Also check max patients per day
  const maxPatients = clinic.maxPatientsPerDay ?? 50;
  const { loadTodaysPatients } = await import("./queue");
  const todaysPatients = await loadTodaysPatients(clinicId);
  const totalToday = todaysPatients.length;
  const isUnderLimit = totalToday < maxPatients;

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
    estimatedWaitMinutes: estimatedQueueDuration,
    shiftEndTime: shiftEnd,
    shiftStartTime: shiftStart,
    timeUntilShiftEnd: Math.max(0, timeUntilShiftEnd),
    reason,
  };
}
