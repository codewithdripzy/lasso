import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const logDirectory = path.join(os.homedir(), ".lasso", "logs");
const logFile = path.join(logDirectory, "lasso.log");

export function lassoLogPath(): string {
  return logFile;
}

export function writeLassoLog(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  try {
    fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
    fs.appendFileSync(logFile, `${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...(data ? { data } : {}) })}\n`, { mode: 0o600 });
  } catch {
    // Diagnostics must never interrupt the CLI or agent runtime.
  }
}

export function readLassoLogs(lines = 100): string[] {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).slice(-Math.max(1, lines));
}

export function clearLassoLogs(): void {
  if (fs.existsSync(logFile)) fs.truncateSync(logFile, 0);
}

export function followLassoLogs(onLine: (line: string) => void): () => void {
  let offset = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
  const handleChange = () => {
    if (!fs.existsSync(logFile)) {
      offset = 0;
      return;
    }
    const size = fs.statSync(logFile).size;
    if (size < offset) offset = 0;
    if (size === offset) return;
    const handle = fs.openSync(logFile, "r");
    const buffer = Buffer.alloc(size - offset);
    fs.readSync(handle, buffer, 0, buffer.length, offset);
    fs.closeSync(handle);
    offset = size;
    for (const line of buffer.toString("utf8").split("\n").filter(Boolean)) onLine(line);
  };
  fs.watchFile(logFile, { interval: 250 }, handleChange);
  return () => fs.unwatchFile(logFile, handleChange);
}
