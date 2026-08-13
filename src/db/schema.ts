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
      timestampServiceIdx: index("idx_logs_timestamp_service").on(
        table.timestamp,
        table.service,
      ),
      timestampLevelIdx: index("idx_logs_timestamp_level").on(
        table.timestamp,
        table.level,
      ),
      compositeIdx: index("idx_logs_composite").on(
        table.timestamp,
        table.service,
        table.level,
      ),
    };
  },
);

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
