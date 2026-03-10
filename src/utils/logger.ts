type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatMessage(level: LogLevel, module: string, msg: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] [${module}] ${msg}`;
}

export function createLogger(module: string) {
  return {
    debug: (msg: string) => { if (shouldLog("debug")) console.debug(formatMessage("debug", module, msg)); },
    info: (msg: string) => { if (shouldLog("info")) console.info(formatMessage("info", module, msg)); },
    warn: (msg: string) => { if (shouldLog("warn")) console.warn(formatMessage("warn", module, msg)); },
    error: (msg: string) => { if (shouldLog("error")) console.error(formatMessage("error", module, msg)); },
  };
}
