import { Request, Response } from "express";
import { LogService } from "../services/logService";

export class LogController {
  static async ingestLogs(req: Request, res: Response): Promise<void> {
    try {
      const { logs } = req.body;

      if (!logs || !Array.isArray(logs)) {
        res.status(400).json({
          error: "Invalid request body format. Expected 'logs' array.",
        });
        return;
      }

      if (logs.length === 0) {
        res.status(400).json({ error: "Logs array cannot be empty." });
        return;
      }

      const result = await LogService.ingestBatch(logs);

      if (result.accepted === 0) {
        res.status(400).json(result);
      } else {
        res.status(200).json(result);
      }
    } catch (error) {
      console.error("Ingest Error:", error);
      res
        .status(400)
        .json({ error: "Malformed JSON or invalid request payload" });
    }
  }

  static async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const { service, level, since, until, q, limit, cursor, ...rest } =
        req.query;

      if (
        level &&
        !["debug", "info", "warn", "error"].includes(level as string)
      ) {
        res.status(400).json({ error: `Unsupported log level: ${level}` });
        return;
      }

      let parsedSince: Date | null = null;
      let parsedUntil: Date | null = null;

      if (since) {
        parsedSince = new Date(since as string);
        if (isNaN(parsedSince.getTime())) {
          res
            .status(400)
            .json({ error: "Invalid timestamp format for 'since'" });
          return;
        }
      }

      if (until) {
        parsedUntil = new Date(until as string);
        if (isNaN(parsedUntil.getTime())) {
          res
            .status(400)
            .json({ error: "Invalid timestamp format for 'until'" });
          return;
        }
      }

      if (parsedSince && parsedUntil && parsedUntil < parsedSince) {
        res
          .status(400)
          .json({ error: "'until' timestamp cannot be earlier than 'since'" });
        return;
      }

      let parsedLimit = 100;
      if (limit !== undefined) {
        if (isNaN(Number(limit))) {
          res.status(400).json({ error: "'limit' must be a numeric value" });
          return;
        }
        parsedLimit = parseInt(limit as string, 10);
        if (parsedLimit < 1 || parsedLimit > 1000) {
          res.status(400).json({ error: "'limit' must be between 1 and 1000" });
          return;
        }
      }

      if (cursor) {
        try {
          const decoded = Buffer.from(cursor as string, "base64").toString(
            "utf-8",
          );
          if (!decoded.includes("#")) {
            res
              .status(400)
              .json({ error: "Invalid or malformed cursor format" });
            return;
          }
        } catch (e) {
          res.status(400).json({ error: "Invalid or malformed cursor" });
          return;
        }
      }

      const attributes: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (key.startsWith("attr.")) {
          const attrKey = key.replace("attr.", "");
          attributes[attrKey] = String(value);
        }
      }

      const result = await LogService.getLogs({
        service: service as string,
        level: level as string,
        since: since as string,
        until: until as string,
        q: q as string,
        limit: parsedLimit,
        cursor: cursor as string,
        attributes,
      });

      res.status(200).json(result);
    } catch (error) {
      console.error("GetLogs Error:", error);
      res.status(400).json({ error: "Invalid query parameters" });
    }
  }

  static async aggregateLogs(req: Request, res: Response): Promise<void> {
    try {
      const { service, level, since, until, q, bucket, group_by, ...rest } =
        req.query;

      if (!since || !until || !bucket) {
        res.status(400).json({
          error:
            "Missing required parameters: 'since', 'until', and 'bucket' are required.",
        });
        return;
      }

      const parsedSince = new Date(since as string);
      const parsedUntil = new Date(until as string);

      if (isNaN(parsedSince.getTime()) || isNaN(parsedUntil.getTime())) {
        res
          .status(400)
          .json({ error: "Invalid timestamp format for 'since' or 'until'" });
        return;
      }

      if (parsedUntil < parsedSince) {
        res
          .status(400)
          .json({ error: "'until' timestamp cannot be earlier than 'since'" });
        return;
      }

      const allowedBuckets = ["1m", "5m", "1h", "1d"];
      if (!allowedBuckets.includes(bucket as string)) {
        res.status(400).json({
          error: "Invalid 'bucket' parameter. Must be one of: 1m, 5m, 1h, 1d",
        });
        return;
      }

      if (group_by && !["service", "level"].includes(group_by as string)) {
        res.status(400).json({
          error: "Invalid 'group_by' parameter. Must be 'service' or 'level'",
        });
        return;
      }

      if (
        level &&
        !["debug", "info", "warn", "error"].includes(level as string)
      ) {
        res.status(400).json({ error: `Unsupported log level: ${level}` });
        return;
      }

      const attributes: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (key.startsWith("attr.")) {
          const attrKey = key.replace("attr.", "");
          attributes[attrKey] = String(value);
        }
      }

      const result = await LogService.aggregateLogs({
        since: since as string,
        until: until as string,
        bucket: bucket as string,
        group_by: group_by as string,
        service: service as string,
        level: level as string,
        q: q as string,
        attributes,
      });

      res.status(200).json(result);
    } catch (error) {
      console.error("Aggregate Error:", error);
      res.status(400).json({ error: "Invalid query parameters" });
    }
  }
}
