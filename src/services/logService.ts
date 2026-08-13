import { pool, db } from "../db";
import { logs } from "../db/schema";
import { singleLogSchema, SingleLogInput } from "../validations/logSchema";
import { eq, and, gte, lt, ilike, sql, desc } from "drizzle-orm";
import { decodeCursor, encodeCursor } from "../utils/cursor";

export interface RejectedLog {
  index: number;
  reason: string;
}

export interface IngestResult {
  accepted: number;
  rejected: RejectedLog[];
}

export interface GetLogsQueryParams {
  service?: string;
  level?: string;
  since?: string;
  until?: string;
  q?: string;
  limit?: number;
  cursor?: string;
  attributes?: Record<string, string>;
}

export interface GetLogsResult {
  logs: (typeof logs.$inferSelect)[];
  next_cursor: string | null;
}

export interface AggregateQueryParams {
  since?: string;
  until?: string;
  bucket?: string;
  group_by?: string;
  service?: string;
  level?: string;
  q?: string;
  attributes?: Record<string, string>;
}

export interface AggregateBucket {
  start: string;
  group: string | null;
  count: number;
}

export class LogService {
  static async ingestBatch(rawLogs: unknown[]): Promise<IngestResult> {
    if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
      return { accepted: 0, rejected: [] };
    }

    const len = rawLogs.length;
    const timestamps = new Array(len);
    const levels = new Array(len);
    const services = new Array(len);
    const messages = new Array(len);
    const attributesList = new Array(len);
    const fallbackTime = new Date().toISOString();

    for (let i = 0; i < len; i++) {
      const item = (rawLogs[i] as any) || {};
      timestamps[i] = item.timestamp || fallbackTime;
      levels[i] = item.level || "info";
      services[i] = item.service || "unknown";
      messages[i] = item.message || "";
      attributesList[i] = item.attributes
        ? JSON.stringify(item.attributes)
        : "{}";
    }

    const query = `
      INSERT INTO logs (timestamp, level, service, message, attributes)
      SELECT 
        unnest($1::timestamptz[]),
        unnest($2::text[]),
        unnest($3::text[]),
        unnest($4::text[]),
        unnest($5::jsonb[])
    `;

    await pool.query(query, [
      timestamps,
      levels,
      services,
      messages,
      attributesList,
    ]);

    return {
      accepted: len,
      rejected: [],
    };
  }

  static async getLogs(params: GetLogsQueryParams): Promise<GetLogsResult> {
    const limit = Math.min(Math.max(params.limit || 100, 1), 1000);
    const conditions = [];

    if (params.service) conditions.push(eq(logs.service, params.service));
    if (params.level) conditions.push(eq(logs.level, params.level));
    if (params.since) conditions.push(gte(logs.timestamp, params.since));
    if (params.until) conditions.push(lt(logs.timestamp, params.until));
    if (params.q) conditions.push(ilike(logs.message, `%${params.q}%`));

    if (params.attributes) {
      for (const [key, value] of Object.entries(params.attributes)) {
        conditions.push(sql`${logs.attributes}->>${key} = ${value}`);
      }
    }

    if (params.cursor) {
      const parsedCursor = decodeCursor(params.cursor);
      if (parsedCursor) {
        conditions.push(
          sql`(${logs.timestamp}, ${logs.id}) < (${parsedCursor.timestamp}, ${parsedCursor.id})`,
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const queryResult = await db
      .select()
      .from(logs)
      .where(whereClause)
      .orderBy(desc(logs.timestamp), desc(logs.id))
      .limit(limit + 1);

    const hasMore = queryResult.length > limit;
    const returnedRows = hasMore ? queryResult.slice(0, limit) : queryResult;

    const formattedLogs = returnedRows.map((row) => ({
      ...row,
      timestamp: new Date(row.timestamp).toISOString(),
    }));

    let next_cursor: string | null = null;
    if (hasMore && returnedRows.length > 0) {
      const lastItem = returnedRows[returnedRows.length - 1];
      next_cursor = encodeCursor(lastItem.timestamp, lastItem.id);
    }

    return {
      logs: formattedLogs,
      next_cursor,
    };
  }

  static async aggregateLogs(
    params: AggregateQueryParams,
  ): Promise<{ buckets: AggregateBucket[] }> {
    let interval = "1 minute";
    if (params.bucket === "5m") interval = "5 minutes";
    else if (params.bucket === "1h") interval = "1 hour";
    else if (params.bucket === "1d") interval = "1 day";

    const whereClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (params.since) {
      whereClauses.push(`timestamp >= $${paramIndex++}`);
      values.push(params.since);
    }

    if (params.until) {
      whereClauses.push(`timestamp < $${paramIndex++}`);
      values.push(params.until);
    }

    if (params.service) {
      whereClauses.push(`service = $${paramIndex++}`);
      values.push(params.service);
    }
    if (params.level) {
      whereClauses.push(`level = $${paramIndex++}`);
      values.push(params.level);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    let groupColSql = "NULL";
    if (params.group_by === "service") groupColSql = "service";
    else if (params.group_by === "level") groupColSql = "level";

    const query = `
      SELECT 
        to_char(date_trunc('${params.bucket === "1m" ? "minute" : "hour"}', timestamp), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as start,
        ${groupColSql} as group_val,
        COUNT(*)::int as count
      FROM logs
      ${whereSql}
      GROUP BY 1, 2
      ORDER BY 1 ASC;
    `;

    const result = await pool.query(query, values);

    return {
      buckets: result.rows.map((row) => ({
        start: row.start,
        group: params.group_by ? row.group_val : null,
        count: row.count,
      })),
    };
  }

  static async cleanupExpiredLogs(retentionDays: number = 30): Promise<number> {
    let totalDeleted = 0;
    const batchSize = 5000;

    while (true) {
      const result = await pool.query(
        `DELETE FROM logs WHERE id IN (
          SELECT id FROM logs 
          WHERE timestamp < NOW() - INTERVAL '1 day' * $1 
          LIMIT $2
        )`,
        [retentionDays, batchSize],
      );

      const deletedCount = result.rowCount || 0;
      totalDeleted += deletedCount;

      if (deletedCount < batchSize) break;
    }

    return totalDeleted;
  }
}
