import express, { Request, Response } from "express";
import dotenv from "dotenv";
import logRoutes from "./routes/logRoutes";
import { pool } from "./db";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json({ limit: "50mb" }));

app.get("/health", async (req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).send("OK");
  } catch (error) {
    res.status(500).send("Database connection error");
  }
});

app.use("/", logRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const shutdown = async () => {
  try {
    await pool.end();
  } catch (err) {
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
