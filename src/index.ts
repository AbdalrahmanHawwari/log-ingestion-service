import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import logRoutes from "./routes/logRoutes";
import { pool } from "./db";
import { LogService } from "./services/logService";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 8080;
const retentionDays = Number(process.env.RETENTION_DAYS) || 30;

app.use(express.json({ limit: "50mb" }));

// Catching Malformed JSON Errors from express.json()
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && "status" in err && err.status === 400) {
    res.status(400).json({ error: "Malformed JSON payload" });
    return;
  }
  next(err);
});

app.get("/health", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).send("OK");
  } catch (error) {
    res.status(500).send("Database connection error");
  }
});

app.use("/", logRoutes);

let retentionInterval: NodeJS.Timeout | null = null;

async function setupDatabaseAndStartServer() {
  try {
    // 1. تفعيل الإضافات وإنشاء الفهارس المتقدمة للـ GIN و pg_trgm للبحث السريع
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
    await pool.query(
      "CREATE INDEX IF NOT EXISTS logs_attributes_gin_idx ON logs USING gin (attributes);",
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS logs_message_trgm_idx ON logs USING gin (message gin_trgm_ops);",
    );

    // 2. تشغيل الـ Retention Scheduler بشكل دوري
    const runRetention = async () => {
      try {
        const deleted = await LogService.cleanupExpiredLogs(retentionDays);
        if (deleted > 0) {
          console.log(
            `[Retention Scheduler] Cleaned up ${deleted} expired logs.`,
          );
        }
      } catch (err) {
        console.error("[Retention Scheduler] Cleanup failed:", err);
      }
    };

    // تشغيل التنظيف فور التشغيل ثم كل ساعة
    runRetention();
    retentionInterval = setInterval(runRetention, 60 * 60 * 1000);

    // 3. بدء الاستماع للطلبات
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize database indexes:", error);
    process.exit(1);
  }
}

setupDatabaseAndStartServer();

const shutdown = async () => {
  if (retentionInterval) clearInterval(retentionInterval);
  try {
    await pool.end();
  } catch (err) {
    console.error("Error during pool shutdown:", err);
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
