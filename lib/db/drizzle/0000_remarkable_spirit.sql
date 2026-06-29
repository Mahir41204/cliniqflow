CREATE TABLE "otp_verifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"otp" varchar NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"registration_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"password_hash" varchar,
	"verified" boolean DEFAULT false NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"doctor_name" text NOT NULL,
	"avg_consultation_minutes" integer DEFAULT 10 NOT NULL,
	"whatsapp_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shift_start_time" text DEFAULT '09:00',
	"shift_end_time" text DEFAULT '17:00',
	"max_patients_per_day" integer DEFAULT 50,
	"clinic_address" text,
	"default_breaks" text,
	"override_date" text,
	"override_shift_start_time" text,
	"override_shift_end_time" text,
	"override_breaks" text,
	CONSTRAINT "clinics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"token_number" integer NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"tracking_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"address" text,
	"email" text,
	"age" integer,
	"emergency_contact" text,
	"whatsapp_opt_in" boolean DEFAULT true,
	"last_notification_sent" timestamp with time zone,
	"notifications_sent" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "patients_tracking_code_unique" UNIQUE("tracking_code")
);
--> statement-breakpoint
CREATE INDEX "IDX_otp_email" ON "otp_verifications" USING btree ("email");--> statement-breakpoint
CREATE INDEX "IDX_otp_expires" ON "otp_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "clinics_owner_id_unique" ON "clinics" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "patients_clinic_id_idx" ON "patients" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "patients_clinic_status_idx" ON "patients" USING btree ("clinic_id","status");