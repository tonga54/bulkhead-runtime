const chunks = [];
process.stdin.on("data", (d) => chunks.push(d));
process.stdin.on("end", () => {
  const params = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  const endpoint = params.endpoint || "all";

  const endpoints = {
    "/api/v1/users": { status: 200, latencyP50: "12ms", latencyP99: "89ms", errorRate: "0.01%", rps: 450 },
    "/api/v1/orders": { status: 200, latencyP50: "34ms", latencyP99: "210ms", errorRate: "0.3%", rps: 1200 },
    "/api/v1/payments": { status: 200, latencyP50: "156ms", latencyP99: "890ms", errorRate: "1.2%", rps: 380, warning: "High p99 latency — Stripe webhook delays" },
    "/api/v1/search": { status: 200, latencyP50: "45ms", latencyP99: "320ms", errorRate: "0.05%", rps: 2100 },
    "/api/v1/webhooks": { status: 503, latencyP50: "2100ms", latencyP99: "5000ms", errorRate: "12.4%", rps: 90, alert: "Circuit breaker OPEN — downstream timeout" },
  };

  if (endpoint !== "all" && endpoints[endpoint]) {
    process.stdout.write(JSON.stringify({ [endpoint]: endpoints[endpoint] }, null, 2));
  } else {
    process.stdout.write(JSON.stringify(endpoints, null, 2));
  }
});
