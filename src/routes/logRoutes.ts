import { Router } from "express";
import { LogController } from "../controllers/logController";

const router = Router();

router.post("/logs", LogController.ingestLogs);
router.get("/logs", LogController.getLogs);
router.get("/logs/aggregate", LogController.aggregateLogs);

export default router;
