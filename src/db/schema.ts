import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// src/db/schema.ts
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
      // فهرس بسيط خفيف جداً على timestamp فقط
      timestampIdx: index("idx_logs_timestamp").on(table.timestamp),
    };
  },
);

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
