import crypto from "crypto";
import {
  db,
  clinicsTable,
  patientsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function upsertUser(id: string, email: string, firstName: string) {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (existing) return existing;
  const [created] = await db
    .insert(usersTable)
    .values({
      id,
      email,
      firstName,
      lastName: "Sample",
      profileImageUrl: null,
      passwordHash: hashPassword(`${firstName.toLowerCase()}1234`),
    })
    .returning();
  return created!;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

async function upsertClinic(args: {
  ownerId: string;
  slug: string;
  name: string;
  doctorName: string;
  avgConsultationMinutes: number;
  whatsappNumber: string;
}) {
  const [existing] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.slug, args.slug));
  if (existing) {
    const [updated] = await db
      .update(clinicsTable)
      .set({
        name: args.name,
        doctorName: args.doctorName,
        avgConsultationMinutes: args.avgConsultationMinutes,
        whatsappNumber: args.whatsappNumber,
      })
      .where(eq(clinicsTable.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(clinicsTable)
    .values({
      id: crypto.randomUUID(),
      ownerId: args.ownerId,
      slug: args.slug,
      name: args.name,
      doctorName: args.doctorName,
      avgConsultationMinutes: args.avgConsultationMinutes,
      whatsappNumber: args.whatsappNumber,
    })
    .returning();
  return created!;
}

function trackingCode(): string {
  return (
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 6)
  ).slice(0, 10);
}

async function seedPatients(
  clinicId: string,
  patients: Array<{
    name: string;
    phone: string;
    status: "waiting" | "in_progress" | "done" | "skipped";
    minutesAgo: number;
  }>,
) {
  await db.delete(patientsTable).where(eq(patientsTable.clinicId, clinicId));
  let token = 1;
  for (const p of patients) {
    const createdAt = new Date(Date.now() - p.minutesAgo * 60_000);
    const completedAt =
      p.status === "done" || p.status === "skipped"
        ? new Date(createdAt.getTime() + 12 * 60_000)
        : null;
    await db.insert(patientsTable).values({
      id: crypto.randomUUID(),
      clinicId,
      name: p.name,
      phone: p.phone,
      tokenNumber: token++,
      trackingCode: trackingCode(),
      status: p.status,
      createdAt,
      completedAt,
    });
  }
}

async function main() {
  const owner = await upsertUser(
    "demo-owner-sunrise",
    "demo@sunrise.example",
    "Sunrise",
  );
  const clinic = await upsertClinic({
    ownerId: owner.id,
    slug: "sunrise-clinic",
    name: "Sunrise Family Clinic",
    doctorName: "Anjali Mehra",
    avgConsultationMinutes: 9,
    whatsappNumber: "+919876543210",
  });
  await seedPatients(clinic.id, [
    { name: "Ramesh Kumar", phone: "+919812345671", status: "done", minutesAgo: 180 },
    { name: "Priya Sharma", phone: "+919812345672", status: "done", minutesAgo: 165 },
    { name: "Mohammed Iqbal", phone: "+919812345673", status: "done", minutesAgo: 150 },
    { name: "Lakshmi Nair", phone: "+919812345674", status: "skipped", minutesAgo: 140 },
    { name: "Arjun Reddy", phone: "+919812345675", status: "done", minutesAgo: 125 },
    { name: "Kavita Joshi", phone: "+919812345676", status: "in_progress", minutesAgo: 30 },
    { name: "Sandeep Patil", phone: "+919812345677", status: "waiting", minutesAgo: 25 },
    { name: "Meera Iyer", phone: "+919812345678", status: "waiting", minutesAgo: 20 },
    { name: "Vikram Singh", phone: "+919812345679", status: "waiting", minutesAgo: 15 },
    { name: "Sneha Das", phone: "+919812345680", status: "waiting", minutesAgo: 10 },
    { name: "Rahul Verma", phone: "+919812345681", status: "waiting", minutesAgo: 5 },
  ]);

  const owner2 = await upsertUser(
    "demo-owner-greenleaf",
    "demo@greenleaf.example",
    "Greenleaf",
  );
  const clinic2 = await upsertClinic({
    ownerId: owner2.id,
    slug: "greenleaf-dental",
    name: "Greenleaf Dental Care",
    doctorName: "Suresh Pillai",
    avgConsultationMinutes: 20,
    whatsappNumber: "+919898989898",
  });
  await seedPatients(clinic2.id, [
    { name: "Anita Bose", phone: "+919898000001", status: "done", minutesAgo: 90 },
    { name: "Karan Malhotra", phone: "+919898000002", status: "in_progress", minutesAgo: 25 },
    { name: "Pooja Rao", phone: "+919898000003", status: "waiting", minutesAgo: 20 },
    { name: "Amitabh Dey", phone: "+919898000004", status: "waiting", minutesAgo: 12 },
  ]);

  console.log("Seeded clinics:", clinic.slug, clinic2.slug);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
