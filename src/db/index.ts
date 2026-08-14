import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import dotenv from "dotenv";

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/log_service_db";

export const pool = new Pool({
  connectionString,
  max: 20, // تقليل القيمة لترك مساحة للمعالج للإنهاء السريع بدلاً من الـ Context Switching
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // زيادة مهلة انتظار الاتصال إلى 10 ثوانٍ لمنع الـ 500/Timeout Errors
});

export const db = drizzle(pool, { schema });
