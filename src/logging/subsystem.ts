// Minimal createSubsystemLogger compatible with OpenClaw's SubsystemLogger interface.
// The full OpenClaw version uses chalk, tslog, and file logging; this provides
// the same API surface with console output only.

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

export type SubsystemLogger = {
  subsystem: string;
  isEnabled: (level: LogLevel, target?: "any" | "console" | "file") => boolean;
  trace: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  fatal: (message: string, meta?: Record<string, unknown>) => void;
  raw: (message: string) => void;
  child: (name: string) => SubsystemLogger;
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
  silent: 6,
};

function getMinLevel(): LogLevel {
  const env = process.env.BULKHEAD_LOG_LEVEL ?? process.env.LOG_LEVEL ?? "";
  if (env && env in LEVEL_PRIORITY) return env as LogLevel;
  return "warn";
}

export function createSubsystemLogger(subsystem: string): SubsystemLogger {
  const minLevel = getMinLevel();

  const shouldLog = (level: LogLevel): boolean => {
    if (minLevel === "silent") return false;
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
  };

  const emit = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (!shouldLog(level)) return;
    const metaSuffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    const line = `[${subsystem}] ${message}${metaSuffix}`;
    if (level === "error" || level === "fatal") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  };

  return {
    subsystem,
    isEnabled: (level) => shouldLog(level),
    trace: (msg, meta) => emit("trace", msg, meta),
    debug: (msg, meta) => emit("debug", msg, meta),
    info: (msg, meta) => emit("info", msg, meta),
    warn: (msg, meta) => emit("warn", msg, meta),
    error: (msg, meta) => emit("error", msg, meta),
    fatal: (msg, meta) => emit("fatal", msg, meta),
    raw: (message) => {
      if (shouldLog("info")) console.log(message);
    },
    child: (name) => createSubsystemLogger(`${subsystem}/${name}`),
  };
}
