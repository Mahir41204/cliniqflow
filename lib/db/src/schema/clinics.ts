import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const clinicsTable = pgTable(
  "clinics",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    doctorName: text("doctor_name").notNull(),
    avgConsultationMinutes: integer("avg_consultation_minutes")
      .notNull()
      .default(10),
    whatsappNumber: text("whatsapp_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("clinics_owner_id_unique").on(table.ownerId)],
);

export type Clinic = typeof clinicsTable.$inferSelect;
export type InsertClinic = typeof clinicsTable.$inferInsert;
