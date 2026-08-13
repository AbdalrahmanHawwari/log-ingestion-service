CREATE TABLE IF NOT EXISTS "logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"service" text NOT NULL,
	"message" text NOT NULL,
	"attributes" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logs_timestamp_service" ON "logs" (""logs"."timestamp" desc","service");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logs_timestamp_level" ON "logs" (""logs"."timestamp" desc","level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logs_composite" ON "logs" (""logs"."timestamp" desc","service","level");