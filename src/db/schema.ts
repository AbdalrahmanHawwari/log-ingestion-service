import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const logs = pgTable(
  "logs",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    level: text("level").notNull(),
    service: text("service").notNull(),
    message: text("message").notNull(),
    attributes: jsonb("attributes").$type<Record<string, any>>(),
  },
  (table) => {
    return {
      // فهرس واحد مركّب متسلسل يدعم جميع استعلامات الـ Ordering والـ Filtering الأساسية
      logsTimestampIdx: index("idx_logs_timestamp_id").on(
        table.timestamp,
        table.id,
      ),
      logsServiceIdx: index("idx_logs_service_ts").on(
        table.service,
        table.timestamp,
      ),
    };
  },
);

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
