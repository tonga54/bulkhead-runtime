import * as fs from "node:fs";
import * as path from "node:path";

export interface AtomicWriteOptions {
  dirMode?: number;
  fileMode?: number;
}

export function atomicWriteFileSync(
  filePath: string,
  data: string,
  options?: AtomicWriteOptions,
): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: options?.dirMode ?? 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, data, { mode: options?.fileMode ?? 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export function escapeShellArg(s: string): string {
  const sanitized = s.replace(/\0/g, "");
  return "'" + sanitized.replace(/'/g, "'\\''") + "'";
}
