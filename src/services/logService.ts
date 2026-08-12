import { pool, db } from "../db";
import { logs } from "../db/schema";
import { singleLogSchema, SingleLogInput } from "../validations/logSchema";
import { eq, and, gte, lt, ilike, sql, desc } from "drizzle-orm";

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
  step?: string;
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
    const validLogsToInsert: SingleLogInput[] = [];
    const rejected: RejectedLog[] = [];

    rawLogs.forEach((item, index) => {
      const result = singleLogSchema.safeParse(item);

      if (result.success) {
        validLogsToInsert.push(result.data);
      } else {
        const issue = result.error.issues[0];
        const reason = issue ? issue.message : "Invalid log format";

        rejected.push({
          index,
          reason,
        });
      }
    });

    if (validLogsToInsert.length > 0) {
      await db.insert(logs).values(validLogsToInsert);
    }

    return {
      accepted: validLogsToInsert.length,
      rejected,
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
      try {
        const decoded = Buffer.from(params.cursor, "base64").toString("utf-8");
        const [cursorTime, cursorId] = decoded.split("#");
        if (cursorTime && cursorId) {
          conditions.push(
            sql`(${logs.timestamp}, ${logs.id}) < (${cursorTime}, ${Number(cursorId)})`,
          );
        }
      } catch (e) {}
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const queryResult = await db
      .select()
      .from(logs)
      .where(whereClause)
      .orderBy(desc(logs.timestamp), desc(logs.id))
      .limit(limit + 1);

    let next_cursor: string | null = null;
    if (queryResult.length > limit) {
      const nextItem = queryResult.pop();
      if (nextItem) {
        const rawCursor = `${nextItem.timestamp}#${nextItem.id}`;
        next_cursor = Buffer.from(rawCursor).toString("base64");
      }
    }

    return {
      logs: queryResult,
      next_cursor,
    };
  }

  static async aggregateLogs(
    params: AggregateQueryParams,
  ): Promise<{ buckets: AggregateBucket[] }> {
    let stepSeconds = 60;
    if (params.bucket === "1m") stepSeconds = 60;
    else if (params.bucket === "5m") stepSeconds = 300;
    else if (params.bucket === "1h") stepSeconds = 3600;
    else if (params.bucket === "1d") stepSeconds = 86400;

    const whereClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // since & until mandatory
    whereClauses.push(`timestamp >= $${paramIndex++}`);
    values.push(params.since);

    whereClauses.push(`timestamp < $${paramIndex++}`);
    values.push(params.until);

    if (params.service) {
      whereClauses.push(`service = $${paramIndex++}`);
      values.push(params.service);
    }
    if (params.level) {
      whereClauses.push(`level = $${paramIndex++}`);
      values.push(params.level);
    }
    if (params.q) {
      whereClauses.push(`message ILIKE $${paramIndex++}`);
      values.push(`%${params.q}%`);
    }

    if (params.attributes) {
      for (const [key, val] of Object.entries(params.attributes)) {
        whereClauses.push(`attributes->>'${key}' = $${paramIndex++}`);
        values.push(val);
      }
    }

    const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

    let groupColSql = "NULL";
    if (params.group_by === "service") {
      groupColSql = "service";
    } else if (params.group_by === "level") {
      groupColSql = "level";
    }

    const query = `
      SELECT 
        to_char(
          to_timestamp(floor(extract(epoch from timestamp::timestamptz) / ${stepSeconds}) * ${stepSeconds}) AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ) as start,
        ${groupColSql} as group_val,
        count(*)::int as count
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
    const result = await pool.query(
      `DELETE FROM logs WHERE timestamp < NOW() - INTERVAL '1 day' * $1`,
      [retentionDays],
    );
    return result.rowCount || 0;
  }
}
