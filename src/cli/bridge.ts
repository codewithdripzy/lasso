// src/cli/bridge.ts
import { WebSocketServer, type WebSocket } from "ws";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

const BRIDGE_PORT = 3056;

export type BridgeMessage =
  | { type: "hello"; from: "overlay" | "cli" }
  | { type: "edit"; instruction: string; model: string; element: { tag: string; group: string; label: string } }
  | { type: "agent_status"; status: "thinking" | "working" | "review" | "error"; message: string };

function readEnvFile(cwd: string, filename: string) {
  try {
    return fs.readFileSync(path.join(cwd, filename), "utf8").split(/\r?\n/).reduce<Record<string, string>>((values, line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?([^"']*)["']?\s*$/);
      if (match) values[match[1]] = match[2].trim();
      return values;
    }, {});
  } catch {
    return {};
  }
}

export function startBridge(cwd = process.cwd()) {
  const bridgeServer = http.createServer(); // dedicated, empty HTTP server
  const wss = new WebSocketServer({ server: bridgeServer });
  let overlaySocket: WebSocket | null = null;
  const fileEnv = { ...readEnvFile(cwd, ".env"), ...readEnvFile(cwd, ".env.local"), ...readEnvFile(cwd, ".env.production") };
  const apiKeyConfigured = Boolean(process.env.VITE_LASSO_API_KEY || process.env.NEXT_LASSO_API_KEY || fileEnv.VITE_LASSO_API_KEY || fileEnv.NEXT_LASSO_API_KEY);

  wss.on("connection", (socket) => {
    overlaySocket = socket;
    console.log(chalk.green("✓") + " Overlay connected");
    socket.send(JSON.stringify({ type: "config", apiKeyConfigured }));

    socket.on("message", (raw) => {
      const msg: BridgeMessage = JSON.parse(raw.toString());
      console.log("[lasso] received from overlay:", msg);
      if (msg.type === "edit") {
        if (!apiKeyConfigured) {
          socket.send(JSON.stringify({ type: "agent_status", status: "error", message: "Set VITE_LASSO_API_KEY or NEXT_LASSO_API_KEY in your app environment before sending an edit." }));
          return;
        }

        socket.send(JSON.stringify({ type: "agent_status", status: "thinking", message: "Reading the selected component…" }));
        setTimeout(() => socket.readyState === socket.OPEN && socket.send(JSON.stringify({ type: "agent_status", status: "working", message: `Preparing a ${msg.model} change for ${msg.element.label}…` })), 900);
        setTimeout(() => socket.readyState === socket.OPEN && socket.send(JSON.stringify({ type: "agent_status", status: "review", message: "Review ready. No files have been changed yet." })), 2200);
      }
    });

    socket.on("close", () => {
      overlaySocket = null;
      console.log(chalk.yellow("!") + " Overlay disconnected");
    });
  });

  bridgeServer.listen(BRIDGE_PORT);

  function send(msg: BridgeMessage) {
    if (overlaySocket?.readyState === overlaySocket?.OPEN) {
      overlaySocket!.send(JSON.stringify(msg));
    }
  }

  return { send };
}
