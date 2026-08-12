import { z } from "zod";

const attributeValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const singleLogSchema = z.object({
  timestamp: z
    .string()
    .datetime({ message: "Must be a valid ISO 8601 timestamp" })
    .refine(
      (ts) => {
        const logDate = new Date(ts).getTime();
        const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
        return logDate <= fiveMinutesFromNow;
      },
      { message: "Must not be more than five minutes in the future" },
    ),

  level: z.enum(["debug", "info", "warn", "error"], {
    errorMap: (issue) => ({
      message: `invalid level: '${issue.path.join(".")}'`,
    }),
  }),

  service: z.string().min(1, { message: "Must be a non-empty string" }),

  message: z.string().min(1, { message: "Must be a non-empty string" }),

  attributes: z
    .record(z.string(), attributeValueSchema)
    .refine(
      (val) => {
        if (!val) return true;
        return Object.values(val).every(
          (v) =>
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean",
        );
      },
      { message: "Must be a flat object without nested objects or arrays" },
    )
    .optional(),
});

export const batchIngestSchema = z.object({
  logs: z.array(z.unknown()),
});

export type SingleLogInput = z.infer<typeof singleLogSchema>;
