import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    // 1. ضغط الـ Ingestion المتواصل
    heavy_ingestion: {
      executor: "constant-vus",
      vus: 20, // 20 مستخدم وهمي بالتوازي
      duration: "1m",
      exec: "ingestLogs",
    },
    // 2. استعلام الـ Aggregation مرة كل ثانية لقياس الـ Latency p95
    aggregation_query: {
      executor: "constant-arrival-rate",
      rate: 1, // 1 request per second
      timeUnit: "1s",
      duration: "1m",
      preAllocatedVUs: 2,
      maxVUs: 5,
      exec: "queryAggregation",
    },
  },
  thresholds: {
    "http_req_duration{scenario:aggregation_query}": ["p(95)<1000"], // p95 أقل من ثانية
    http_req_failed: ["rate<0.01"], // نسبة الأخطاء أقل من 1%
  },
};

const BASE_URL = "http://localhost:8080";

// تجهيز payload ثابت بـ 1000 سجل مسبقاً لتقليل استهلاك الـ CPU في k6
function generateBatch(size) {
  const logs = [];
  const now = new Date().toISOString();
  const services = ["auth-service", "checkout", "payment-v2", "user-service"];
  const levels = ["debug", "info", "warn", "error"];

  for (let i = 0; i < size; i++) {
    logs.push({
      timestamp: now,
      level: levels[i % levels.length],
      service: services[i % services.length],
      message: `Transaction processed successfully with code ${i}`,
      attributes: {
        user_id: `usr_${i}`,
        region: "us-east-1",
        env: "production",
      },
    });
  }
  return JSON.stringify({ logs });
}

const BATCH_SIZE = 1000; // 1,000 logs لكل طلب
const pregeneratedPayload = generateBatch(BATCH_SIZE);
const headers = { "Content-Type": "application/json" };

export function ingestLogs() {
  const res = http.post(`${BASE_URL}/logs`, pregeneratedPayload, { headers });
  check(res, {
    "POST /logs status is 200": (r) => r.status === 200,
  });
}

export function queryAggregation() {
  const now = new Date();
  const past = new Date(now.getTime() - 24 * 60 * 60 * 1000); // آخر 24 ساعة

  const since = past.toISOString();
  const until = now.toISOString();

  const url = `${BASE_URL}/logs/aggregate?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&bucket=1h&group_by=service`;

  const res = http.get(url);
  check(res, {
    "GET /aggregate status is 200": (r) => r.status === 200,
  });
}
