// src/db/schema.ts
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
      // composite index يخدم التجميع والفلترة معاً بسرعة الخرق
      idx_ts_service_level: index("idx_logs_ts_service_level").on(
        table.timestamp,
        table.service,
        table.level,
      ),
    };
  },
);
