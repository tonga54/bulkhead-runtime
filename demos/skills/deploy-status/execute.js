const chunks = [];
process.stdin.on("data", (d) => chunks.push(d));
process.stdin.on("end", () => {
  const params = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  const service = params.service || "all";

  const services = {
    api: { status: "healthy", version: "2.4.1", uptime: "14d 6h", replicas: "3/3", lastDeploy: "2026-04-03T10:30:00Z" },
    worker: { status: "healthy", version: "2.4.1", uptime: "14d 6h", replicas: "5/5", lastDeploy: "2026-04-03T10:32:00Z" },
    gateway: { status: "degraded", version: "2.4.0", uptime: "2h 15m", replicas: "2/3", lastDeploy: "2026-04-05T03:45:00Z", issue: "1 replica restarting (OOMKilled)" },
    database: { status: "healthy", version: "16.2", uptime: "45d", type: "PostgreSQL", connections: "42/200" },
    cache: { status: "healthy", version: "7.2.4", uptime: "30d", type: "Redis", memoryUsage: "1.2GB/4GB" },
  };

  if (service !== "all" && services[service]) {
    process.stdout.write(JSON.stringify({ [service]: services[service] }, null, 2));
  } else {
    process.stdout.write(JSON.stringify(services, null, 2));
  }
});
