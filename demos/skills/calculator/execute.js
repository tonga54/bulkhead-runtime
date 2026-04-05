const chunks = [];
process.stdin.on("data", (d) => chunks.push(d));
process.stdin.on("end", () => {
  const params = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  const expr = params.expression || "";

  if (!expr) {
    process.stdout.write(JSON.stringify({ error: "No expression provided" }));
    return;
  }

  const safe = /^[0-9+\-*/().,%\s]+$/.test(expr);
  if (!safe) {
    process.stdout.write(JSON.stringify({ error: "Invalid expression — only numbers and basic operators allowed" }));
    return;
  }

  try {
    const result = Function(`"use strict"; return (${expr})`)();
    process.stdout.write(JSON.stringify({ expression: expr, result }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ expression: expr, error: e.message }));
  }
});
