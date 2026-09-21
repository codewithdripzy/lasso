// src/cli/bridge.ts
import { WebSocketServer, type WebSocket } from "ws";
import http from "node:http";
import chalk from "chalk";

const BRIDGE_PORT = 3056;

export type BridgeMessage =
  | { type: "hello"; from: "overlay" | "cli" }
  | { type: "test"; payload: string };

export function startBridge() {
  const bridgeServer = http.createServer(); // dedicated, empty HTTP server
  const wss = new WebSocketServer({ server: bridgeServer });
  let overlaySocket: WebSocket | null = null;

  wss.on("connection", (socket) => {
    overlaySocket = socket;
    console.log(chalk.green("✓") + " Overlay connected");

    socket.on("message", (raw) => {
      const msg: BridgeMessage = JSON.parse(raw.toString());
      console.log("[lasso] received from overlay:", msg);
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