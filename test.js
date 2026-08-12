import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 50,
  duration: "30s",
};

const BASE_URL = "http://localhost:8080";

export default function () {
  const payload = JSON.stringify({
    logs: Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date().toISOString(),
      level: i % 2 === 0 ? "error" : "info",
      service: "checkout",
      message: `log entry number ${i}`,
      attributes: { user_id: `${i}`, region: "us-east" },
    })),
  });

  const params = { headers: { "Content-Type": "application/json" } };

  const res1 = http.post(`${BASE_URL}/logs`, payload, params);
  check(res1, { "POST /logs is 200": (r) => r.status === 200 });

  const res2 = http.get(`${BASE_URL}/logs?service=checkout&limit=50`);
  check(res2, { "GET /logs is 200": (r) => r.status === 200 });

  sleep(0.001);
}
