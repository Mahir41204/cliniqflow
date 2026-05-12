import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const patientsTable = pgTable(
  "patients",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    tokenNumber: integer("token_number").notNull(),
    status: text("status", {
      enum: ["waiting", "in_progress", "done", "skipped"],
    })
      .notNull()
      .default("waiting"),
    trackingCode: text("tracking_code").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    // Extended patient fields
    address: text("address"),
    email: text("email"),
    age: integer("age"),
    emergencyContact: text("emergency_contact"),

    // WhatsApp notification tracking
    whatsappOptIn: boolean("whatsapp_opt_in").default(true),
    lastNotificationSent: timestamp("last_notification_sent", {
      withTimezone: true,
    }),
    notificationsSent: text("notifications_sent")
      .array()
      .default([])
      .notNull(),
  },
  (table) => [
    index("patients_clinic_id_idx").on(table.clinicId),
    index("patients_clinic_status_idx").on(table.clinicId, table.status),
  ],
);

export type PatientRow = typeof patientsTable.$inferSelect;
export type InsertPatient = typeof patientsTable.$inferInsert;
