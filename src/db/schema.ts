import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const logs = pgTable(
  "logs",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    level: varchar("level", { length: 20 }).notNull(),
    service: varchar("service", { length: 100 }).notNull(),
    message: text("message").notNull(),
    attributes: jsonb("attributes").default(sql`'{}'::jsonb`),
  },
  (table) => {
    return {
      timestampIdIdx: index("logs_timestamp_id_idx").on(
        table.timestamp,
        table.id,
      ),
      serviceIdx: index("logs_service_idx").on(table.service),
      levelIdx: index("logs_level_idx").on(table.level),
      attributesIdx: index("logs_attributes_idx").on(table.attributes),
    };
  },
);
