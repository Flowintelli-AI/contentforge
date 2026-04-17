// ─── Structured integration logger ───────────────────────────────────────────

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  integration: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

function log(level: LogLevel, integration: string, message: string, data?: unknown) {
  const entry: LogEntry = {
    level,
    integration,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export function createLogger(integration: string) {
  return {
    info: (message: string, data?: unknown) => log("info", integration, message, data),
    warn: (message: string, data?: unknown) => log("warn", integration, message, data),
    error: (message: string, data?: unknown) => log("error", integration, message, data),
  };
}
