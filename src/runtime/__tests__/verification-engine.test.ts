import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { VerificationEngine } from "../verification-engine";

// Temp projects live under the server package so `npx tsc` resolves the
// locally installed TypeScript instead of hitting the network.
const TMP_ROOT = path.join(process.cwd(), ".tmp-tests");

describe("VerificationEngine", () => {
  let dir: string;

  beforeEach(() => {
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    dir = fs.mkdtempSync(path.join(TMP_ROOT, "verify-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("skips typecheck when there is no tsconfig (inconclusive, not a failure)", async () => {
    fs.writeFileSync(path.join(dir, "index.js"), "console.log(1)");
    const engine = new VerificationEngine(dir);

    const result = await engine.verifyTypecheck("verify");

    assert.equal(result.type, "typecheck");
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
    assert.equal(result.errors.length, 0);
    assert.match(result.observations[0].summary, /skipped/i);
  });

  it("passes typecheck for a valid project", async () => {
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: true }, files: ["ok.ts"] }));
    fs.writeFileSync(path.join(dir, "ok.ts"), "export const x: number = 1;");
    const engine = new VerificationEngine(dir);

    const result = await engine.verifyTypecheck("verify");

    assert.equal(result.type, "typecheck");
    assert.equal(result.command, "npx tsc --noEmit");
    assert.equal(result.skipped, undefined);
    assert.equal(result.success, true, result.output || result.error || "");
    assert.equal(result.errors.length, 0);
  });

  it("reports a real typecheck failure as a recoverable verification error", async () => {
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: true }, files: ["bad.ts"] }));
    fs.writeFileSync(path.join(dir, "bad.ts"), "export const x: number = 'not a number';");
    const engine = new VerificationEngine(dir);

    const result = await engine.verifyTypecheck("verify");

    assert.equal(result.success, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].type, "verification");
    assert.equal(result.errors[0].recoverable, true);
    assert.equal(result.command, "npx tsc --noEmit");
  });

  it("skips build when package.json has no build script", async () => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", scripts: { test: "echo ok" } }));
    const engine = new VerificationEngine(dir);

    const result = await engine.verifyBuild("verify");

    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
    assert.equal(result.errors.length, 0);
    assert.match(result.observations[0].summary, /skipped/i);
  });

  it("skips build when there is no package.json", async () => {
    const engine = new VerificationEngine(dir);
    const result = await engine.verifyBuild("verify");

    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
    assert.equal(result.errors.length, 0);
  });

  it("reports a real build failure as an error (corrective-run input)", async () => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", scripts: { build: "node -e \"console.error('boom'); process.exit(2)\"" } }));
    const engine = new VerificationEngine(dir);

    const result = await engine.verifyBuild("verify");

    assert.equal(result.success, false);
    assert.equal(result.skipped, undefined);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].type, "verification");
    assert.equal(result.errors[0].recoverable, true);
    assert.equal(result.command, "npm run build");
    assert.ok((result.output || "").includes("boom"));
  });

  it("allPassed/getErrors aggregate across results", async () => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x" }));
    const engine = new VerificationEngine(dir);

    const results = await Promise.all([engine.verifyTypecheck("verify"), engine.verifyBuild("verify")]);

    assert.equal(engine.allPassed(results), true);
    assert.equal(engine.getErrors(results).length, 0);
    assert.ok(engine.getObservations(results).length >= 2);
  });
});
