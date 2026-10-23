import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EventSink, newRunState, LocalAgentAdapter } from "../adapters/local-agent-adapter";
import { ClaudeCodeAdapter } from "../adapters/claude-code-adapter";
import { OpenCodeAdapter } from "../adapters/opencode-adapter";
import { CodexCLIAdapter } from "../adapters/codex-cli-adapter";
import { CursorAdapter } from "../adapters/cursor-adapter";
import { TaskContext, BackendEvent, BackendResult } from "../backend-interface";

// ── test harness ───────────────────────────────────────────────────────

function makeContext(_projectPath: string, overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    taskId: "task-1",
    userPrompt: "Add a greeting function",
    project: {
      projectId: "proj-1",
      hasTypeScript: true,
      hasTailwind: false,
      hasReact: false,
      hasNext: false,
      hasVite: true,
      files: ["src/index.ts"],
    },
    conversation: [{ role: "user", content: "Add a greeting function", timestamp: Date.now() }],
    previousObservations: [],
    previousErrors: [],
    currentPhase: "execute",
    constraints: { safetyLevel: "standard" },
    ...overrides,
  };
}

function makeSink(taskId = "task-1") {
  const events: BackendEvent[] = [];
  const state = newRunState();
  const sink = new EventSink(taskId, (event) => events.push(event), state);
  return { events, state, sink };
}

function eventsOfType(events: BackendEvent[], type: BackendEvent["type"]) {
  return events.filter((e) => e.type === type);
}

// Expose protected parsing/command construction for assertions.
class ClaudeProbe extends ClaudeCodeAdapter {
  parse(line: string, ctx: TaskContext, sink: EventSink): boolean {
    return this.handleLine(line, ctx, sink);
  }
  command(ctx: TaskContext) {
    return this.buildCommand(ctx);
  }
}

class OpenCodeProbe extends OpenCodeAdapter {
  parse(line: string, ctx: TaskContext, sink: EventSink): boolean {
    return this.handleLine(line, ctx, sink);
  }
}

class CodexProbe extends CodexCLIAdapter {
  parse(line: string, ctx: TaskContext, sink: EventSink): boolean {
    return this.handleLine(line, ctx, sink);
  }
}

class CursorProbe extends CursorAdapter {
  parse(line: string, ctx: TaskContext, sink: EventSink): boolean {
    return this.handleLine(line, ctx, sink);
  }
}

function loadFixtureLines(name: string): string[] {
  const file = path.join("/tmp", "lasso-probe", name, "out.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// ── event normalization ────────────────────────────────────────────────

describe("local agent event normalization", () => {
  it("claude: normalizes init, tool_use, and successful result", () => {
    const projectPath = "/proj";
    const adapter = new ClaudeProbe({ type: "local_agent", provider: "claude_code", projectPath });
    const ctx = makeContext(projectPath);
    const { events, state, sink } = makeSink();

    assert.equal(adapter.parse(JSON.stringify({ type: "system", subtype: "init", session_id: "sess-1", model: "claude-sonnet" }), ctx, sink), true);
    assert.equal(
      adapter.parse(
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Editing the file now" },
              { type: "tool_use", name: "Write", input: { file_path: "/proj/src/app.ts", content: "x" } },
            ],
          },
        }),
        ctx,
        sink
      ),
      true
    );
    assert.equal(adapter.parse(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "All done." }), ctx, sink), true);

    assert.equal(state.sessionId, "sess-1");
    assert.equal(state.receivedTerminalSuccess, true);
    assert.equal(state.summary, "All done.");
    assert.equal(state.failureMessage, undefined);

    const toolStarts = eventsOfType(events, "tool_started");
    assert.equal(toolStarts.length, 1);
    assert.equal(toolStarts[0].data?.tool, "Write");

    const fileMods = eventsOfType(events, "file_modified");
    assert.equal(fileMods.length, 1);
    assert.equal(fileMods[0].data?.filePath, "src/app.ts");

    const progresses = eventsOfType(events, "task_progress");
    assert.ok(progresses.some((e) => e.data?.message === "Editing the file now"));
  });

  it("claude: billing error is an auth failure with terminal error result", () => {
    const projectPath = "/proj";
    const adapter = new ClaudeProbe({ type: "local_agent", provider: "claude_code", projectPath });
    const ctx = makeContext(projectPath);
    const { events, state, sink } = makeSink();

    adapter.parse(
      JSON.stringify({
        type: "assistant",
        error: "billing_error",
        message: { role: "assistant", content: [{ type: "text", text: "Credit balance is too low" }] },
      }),
      ctx,
      sink
    );
    adapter.parse(JSON.stringify({ type: "result", is_error: true, result: "Credit balance is too low" }), ctx, sink);

    assert.equal(state.authFailure, true);
    assert.match(state.failureMessage || "", /credit balance/i);
    assert.notEqual(state.receivedTerminalSuccess, true);

    const errors = eventsOfType(events, "error");
    assert.ok(errors.length >= 1);
    assert.equal((errors[0].data?.error as any)?.type, "permission");
  });

  it("claude: real fixture (when present) parses without unparseable events", () => {
    const lines = loadFixtureLines("claude");
    if (lines.length === 0) return; // gated on local probe availability

    const projectPath = path.join("/tmp", "lasso-probe", "claude");
    const adapter = new ClaudeProbe({ type: "local_agent", provider: "claude_code", projectPath });
    const ctx = makeContext(projectPath);
    const { state, sink } = makeSink();

    for (const line of lines) {
      assert.equal(adapter.parse(line, ctx, sink), true, `unparseable: ${line.slice(0, 80)}`);
    }

    // The captured run hit a billing error.
    assert.equal(state.authFailure, true);
    assert.ok(state.sessionId);
  });

  it("opencode: normalizes tool_use, text, and step_finish", () => {
    const projectPath = "/proj";
    const adapter = new OpenCodeProbe({ type: "local_agent", provider: "opencode", projectPath });
    const ctx = makeContext(projectPath);
    const { events, state, sink } = makeSink();

    adapter.parse(JSON.stringify({ type: "step_start", sessionID: "ses_1", part: {} }), ctx, sink);
    adapter.parse(
      JSON.stringify({
        type: "tool_use",
        sessionID: "ses_1",
        part: { type: "tool", tool: "write", state: { status: "completed", input: { content: "ok", filePath: "/proj/hello.txt" } } },
      }),
      ctx,
      sink
    );
    adapter.parse(JSON.stringify({ type: "text", sessionID: "ses_1", part: { type: "text", text: "Created hello.txt." } }), ctx, sink);
    adapter.parse(JSON.stringify({ type: "step_finish", sessionID: "ses_1", part: { type: "step-finish", reason: "stop" } }), ctx, sink);

    assert.equal(state.sessionId, "ses_1");
    assert.equal(state.receivedTerminalSuccess, true);

    const toolCompleted = eventsOfType(events, "tool_completed");
    assert.equal(toolCompleted.length, 1);
    assert.equal(toolCompleted[0].data?.tool, "write");

    const fileChanges = eventsOfType(events, "file_modified");
    assert.equal(fileChanges.length, 1);
    assert.equal(fileChanges[0].data?.filePath, "hello.txt");

    assert.ok(eventsOfType(events, "task_progress").some((e) => e.data?.message === "Created hello.txt."));
  });

  it("opencode: error event marks failure", () => {
    const projectPath = "/proj";
    const adapter = new OpenCodeProbe({ type: "local_agent", provider: "opencode", projectPath });
    const ctx = makeContext(projectPath);
    const { events, state, sink } = makeSink();

    adapter.parse(JSON.stringify({ type: "error", sessionID: "ses_1", error: { message: "model unavailable" } }), ctx, sink);

    assert.equal(state.failureMessage, "model unavailable");
    assert.equal(eventsOfType(events, "error").length, 1);
  });

  it("codex: thread, command execution, file change, and turn completion", () => {
    const projectPath = "/proj";
    const adapter = new CodexProbe({ type: "local_agent", provider: "codex_cli", projectPath });
    const ctx = makeContext(projectPath);
    const { events, state, sink } = makeSink();

    adapter.parse(JSON.stringify({ type: "thread.started", thread_id: "thr-1" }), ctx, sink);
    adapter.parse(JSON.stringify({ type: "turn.started" }), ctx, sink);
    adapter.parse(JSON.stringify({ type: "item.started", item: { item_type: "command_execution", command: "ls" } }), ctx, sink);
    adapter.parse(JSON.stringify({ type: "item.completed", item: { item_type: "command_execution", command: "ls", exit_code: 0, status: "completed" } }), ctx, sink);
    adapter.parse(
      JSON.stringify({
        type: "item.completed",
        item: {
          item_type: "file_change",
          changes: [
            { path: "/proj/src/old.ts", kind: "delete" },
            { path: "/proj/src/new.ts", kind: "add" },
          ],
        },
      }),
      ctx,
      sink
    );
    adapter.parse(JSON.stringify({ type: "turn.completed" }), ctx, sink);

    assert.equal(state.sessionId, "thr-1");
    assert.equal(state.receivedTerminalSuccess, true);
    assert.ok(eventsOfType(events, "tool_started").some((e) => e.data?.tool === "shell"));
    assert.ok(eventsOfType(events, "tool_completed").some((e) => e.data?.tool === "file_change"));

    const deleted = eventsOfType(events, "file_deleted");
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].data?.filePath, path.join("src", "old.ts"));
    assert.equal(eventsOfType(events, "file_modified").length, 1);
  });

  it("codex: usage limit is an auth failure (real fixture when present)", () => {
    const lines = loadFixtureLines("codex");
    if (lines.length === 0) return;

    const projectPath = path.join("/tmp", "lasso-probe", "codex");
    const adapter = new CodexProbe({ type: "local_agent", provider: "codex_cli", projectPath });
    const ctx = makeContext(projectPath);
    const { events, state, sink } = makeSink();

    for (const line of lines) {
      assert.equal(adapter.parse(line, ctx, sink), true);
    }

    assert.equal(state.authFailure, true);
    assert.match(state.failureMessage || "", /usage limit/i);
    assert.equal(eventsOfType(events, "error").length, 1);
    assert.notEqual(state.receivedTerminalSuccess, true);
  });

  it("cursor: normalizes system init, assistant text, tool calls, and result", () => {
    const projectPath = "/proj";
    const adapter = new CursorProbe({ type: "local_agent", provider: "cursor", projectPath });
    const ctx = makeContext(projectPath);
    const { events, state, sink } = makeSink();

    adapter.parse(JSON.stringify({ type: "system", subtype: "init", session_id: "cur-1", model: "composer-2" }), ctx, sink);
    adapter.parse(JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Working on it" }] } }), ctx, sink);
    adapter.parse(JSON.stringify({ type: "tool_call", subtype: "started", tool_call: { editToolCall: { args: { path: "/proj/src/a.ts" } } } }), ctx, sink);
    adapter.parse(JSON.stringify({ type: "tool_call", subtype: "completed", tool_call: { editToolCall: { args: { path: "/proj/src/a.ts" } } } }), ctx, sink);
    adapter.parse(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Done" }), ctx, sink);

    assert.equal(state.sessionId, "cur-1");
    assert.equal(state.receivedTerminalSuccess, true);
    assert.equal(state.summary, "Done");

    const starts = eventsOfType(events, "tool_started");
    const completes = eventsOfType(events, "tool_completed");
    assert.equal(starts.length, 1);
    assert.equal(completes.length, 1);
    assert.equal(starts[0].data?.tool, "edit");
    assert.equal(eventsOfType(events, "file_modified").length, 1);

    const progresses = eventsOfType(events, "task_progress");
    assert.ok(progresses.some((e) => e.data?.message === "Working on it"));
  });

  it("cursor: error result is a failure", () => {
    const projectPath = "/proj";
    const adapter = new CursorProbe({ type: "local_agent", provider: "cursor", projectPath });
    const ctx = makeContext(projectPath);
    const { events, state, sink } = makeSink();

    adapter.parse(JSON.stringify({ type: "result", subtype: "error", is_error: true, result: "Model overloaded" }), ctx, sink);

    assert.equal(state.failureMessage, "Model overloaded");
    assert.notEqual(state.receivedTerminalSuccess, true);
    assert.equal(eventsOfType(events, "error").length, 1);
  });

  it("malformed lines are rejected, not thrown", () => {
    const projectPath = "/proj";
    const adapter = new ClaudeProbe({ type: "local_agent", provider: "claude_code", projectPath });
    const ctx = makeContext(projectPath);
    const { sink } = makeSink();

    assert.equal(adapter.parse("this is not json", ctx, sink), false);
    assert.equal(adapter.parse(JSON.stringify({ type: "assistant" }), ctx, sink), true);
  });
});

// ── capabilities & session continuation ────────────────────────────────

describe("backend capabilities", () => {
  it("local agents advertise an internal loop, streaming, and cancellation", () => {
    const projectPath = "/proj";
    const adapters: LocalAgentAdapter[] = [
      new ClaudeProbe({ type: "local_agent", provider: "claude_code", projectPath }),
      new OpenCodeProbe({ type: "local_agent", provider: "opencode", projectPath }),
      new CodexProbe({ type: "local_agent", provider: "codex_cli", projectPath }),
      new CursorProbe({ type: "local_agent", provider: "cursor", projectPath }),
    ];

    for (const adapter of adapters) {
      const caps = adapter.getCapabilities();
      assert.equal(caps.hasInternalLoop, true, adapter.provider);
      assert.equal(caps.canStreamEvents, true, adapter.provider);
      assert.equal(caps.supportsCancellation, true, adapter.provider);
      assert.equal(caps.providesStructuredDiffs, false, adapter.provider);
      assert.equal(caps.canIsolateWorkspace, false, adapter.provider);
    }
  });

  it("claude command includes resume when an external session exists", () => {
    const projectPath = "/proj";
    const adapter = new ClaudeProbe({ type: "local_agent", provider: "claude_code", projectPath, modelId: "sonnet" });

    const fresh = adapter.command(makeContext(projectPath));
    assert.ok(fresh.args.includes("--session-id"));
    assert.ok(!fresh.args.includes("--resume"));
    assert.ok(fresh.args.includes("--output-format"));
    assert.ok(fresh.args.includes("stream-json"));
    assert.ok(fresh.args.includes("--model"));

    const resumed = adapter.command(makeContext(projectPath, { sessionRef: { id: "ext-42" } }));
    const resumeIdx = resumed.args.indexOf("--resume");
    assert.ok(resumeIdx >= 0);
    assert.equal(resumed.args[resumeIdx + 1], "ext-42");
    assert.ok(!resumed.args.includes("--session-id"));
  });

  it("switching away from a resumable agent reports lost internal state", async () => {
    const projectPath = "/proj";
    const from = new ClaudeProbe({ type: "local_agent", provider: "claude_code", projectPath });
    const to = new CursorProbe({ type: "local_agent", provider: "cursor", projectPath });

    const result = await from.switchBackend(to, makeContext(projectPath, { sessionRef: { id: "ext-1" } }));

    assert.equal(result.transferableContext.externalSessionId, "ext-1");
    assert.ok(Array.isArray(result.transferableContext.conversation));
    assert.ok(result.lostContext.length >= 1);
    assert.ok(result.lostContext.some((m) => /claude_code/.test(m)));
  });
});

// ── execution: success rails, failure rails, cancellation ──────────────

describe("local agent execution (fake binary)", () => {
  let dir: string;
  let scriptPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lasso-fake-agent-"));
    scriptPath = path.join(dir, "fake-agent.js");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  class FakeClaude extends ClaudeProbe {
    script: string;
    constructor(projectPath: string, script: string) {
      super({ type: "local_agent", provider: "claude_code", projectPath });
      this.script = script;
    }
    protected buildCommand(ctx: TaskContext) {
      void ctx;
      return { bin: process.execPath, args: [this.script], cwd: this.config.projectPath };
    }
  }

  async function runFake(scriptSource: string, options: { abortAfterMs?: number } = {}): Promise<{ result: BackendResult; events: BackendEvent[] }> {
    fs.writeFileSync(scriptPath, scriptSource);
    const adapter = new FakeClaude(dir, scriptPath);
    const events: BackendEvent[] = [];
    const controller = new AbortController();
    if (options.abortAfterMs !== undefined) {
      setTimeout(() => controller.abort(), options.abortAfterMs);
    }
    const result = await adapter.executeTask(makeContext(dir), (event) => events.push(event), controller.signal);
    return { result, events };
  }

  it("succeeds only when the agent reports terminal success with exit 0", async () => {
    const { result, events } = await runFake(`
      const lines = [
        JSON.stringify({ type: "system", subtype: "init", session_id: "s1", model: "claude-sonnet" }),
        JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Finished the task." }),
      ];
      for (const line of lines) console.log(line);
      process.exit(0);
    `);

    assert.equal(result.success, true);
    assert.equal(result.status, "completed");
    assert.equal(result.summary, "Finished the task.");
    assert.equal(result.errors.length, 0);
    // Guard diff is authoritative — adapters never report file changes.
    assert.deepEqual(result.fileChanges, []);
    assert.ok(events.some((e) => e.type === "task_completed"));
    assert.equal(result.metadata?.externalSessionId, "s1");
  });

  it("fails when the process exits 0 without a terminal success signal", async () => {
    const { result, events } = await runFake(`process.exit(0);`);

    assert.equal(result.success, false);
    assert.equal(result.status, "failed");
    assert.ok(result.errors.length >= 1);
    assert.match(result.errors[0].message, /without reporting a successful result/);
    assert.ok(events.some((e) => e.type === "task_failed"));
  });

  it("fails with the agent's own failure message", async () => {
    const { result, events } = await runFake(`
      console.log(JSON.stringify({ type: "result", is_error: true, result: "Credit balance is too low" }));
      process.exit(1);
    `);

    assert.equal(result.success, false);
    assert.equal(result.status, "failed");
    assert.ok(result.errors.some((e) => /credit balance/i.test(e.message)));
    assert.ok(events.some((e) => e.type === "task_failed"));
  });

  it("cancellation aborts the child and reports a cancelled result", async () => {
    const { result, events } = await runFake(
      `
      console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "s2", model: "claude-sonnet" }));
      setInterval(() => {}, 1000);
      `,
      { abortAfterMs: 300 }
    );

    assert.equal(result.success, false);
    assert.equal(result.status, "cancelled");
    assert.ok(events.some((e) => e.type === "task_cancelled"));
  });

  it("checkAvailability returns structured availability without throwing", async () => {
    const adapter = new FakeClaude(dir, scriptPath);
    const availability = await adapter.checkAvailability();

    assert.equal(typeof availability.available, "boolean");
    assert.equal(typeof availability.installed, "boolean");
    assert.equal(typeof availability.authenticated, "boolean");
    if (!availability.installed) {
      assert.ok(availability.error);
      assert.ok(availability.fixInstructions);
    }
  });
});
