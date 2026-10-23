import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import https from "node:https";
import http from "node:http";
import { HOST_DIR } from "./paths";

export const TLS_KEY_FILE = path.join(HOST_DIR, "host.key");
export const TLS_CERT_FILE = path.join(HOST_DIR, "host.crt");

function hasCertificate(): boolean {
  return fs.existsSync(TLS_KEY_FILE) && fs.existsSync(TLS_CERT_FILE);
}

function isMkcertInstalled(): boolean {
  // Check system PATH first
  try {
    execFileSync("mkcert", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    // Check local installation
    try {
      const localMkcert = path.join(os.homedir(), ".lasso", "bin", "mkcert");
      if (fs.existsSync(localMkcert)) {
        execFileSync(localMkcert, ["-version"], { stdio: "ignore" });
        return true;
      }
    } catch {}
    return false;
  }
}

function getMkcertPath(): string {
  // Check local installation first
  const localMkcert = path.join(os.homedir(), ".lasso", "bin", "mkcert");
  if (fs.existsSync(localMkcert)) {
    return localMkcert;
  }
  return "mkcert";
}

async function downloadMkcert(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const platform = os.platform();
  const arch = os.arch();
  let downloadUrl: string;
  let binaryName: string;

  // Determine the correct binary for the platform
  if (platform === "darwin") {
    if (arch === "x64") {
      downloadUrl = "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-darwin-amd64";
      binaryName = "mkcert-darwin-amd64";
    } else if (arch === "arm64") {
      downloadUrl = "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-darwin-arm64";
      binaryName = "mkcert-darwin-arm64";
    } else {
      return { ok: false, error: `Unsupported architecture: ${arch}` };
    }
  } else if (platform === "linux") {
    if (arch === "x64") {
      downloadUrl = "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-amd64";
      binaryName = "mkcert-linux-amd64";
    } else if (arch === "arm64") {
      downloadUrl = "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-arm64";
      binaryName = "mkcert-linux-arm64";
    } else {
      return { ok: false, error: `Unsupported architecture: ${arch}` };
    }
  } else {
    return { ok: false, error: `Unsupported platform: ${platform}` };
  }

  return new Promise((resolve) => {
    const protocol = downloadUrl.startsWith("https") ? https : http;
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, binaryName);

    console.log(`[Lasso] Downloading mkcert from ${downloadUrl}...`);
    const file = fs.createWriteStream(tempPath);

    protocol
      .get(downloadUrl, (response) => {
        if (response.statusCode !== 200) {
          fs.unlinkSync(tempPath);
          return resolve({ ok: false, error: `Failed to download mkcert: ${response.statusCode}` });
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          fs.chmodSync(tempPath, 0o755);
          console.log(`[Lasso] ✓ mkcert downloaded to ${tempPath}`);
          resolve({ ok: true, path: tempPath });
        });
      })
      .on("error", (error) => {
        fs.unlinkSync(tempPath);
        resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
  });
}

async function installMkcert(): Promise<{ ok: boolean; error?: string }> {
  const platform = os.platform();

  // Try package manager first
  if (platform === "darwin") {
    try {
      execFileSync("brew", ["--version"], { stdio: "ignore" });
      console.log("[Lasso] Installing mkcert via Homebrew...");
      const installResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const install = spawn("brew", ["install", "mkcert", "nss"], { stdio: "inherit" });
        install.on("close", (code) => {
          if (code === 0) resolve({ ok: true });
          else resolve({ ok: false, error: `Homebrew install failed with code ${code}` });
        });
        install.on("error", (error) => {
          resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      });
      if (installResult.ok) {
        execFileSync("mkcert", ["-install"], { stdio: "ignore" });
        console.log("[Lasso] ✓ mkcert installed and CA configured");
        return { ok: true };
      }
    } catch {
      console.log("[Lasso] Homebrew not available, trying direct download...");
    }
  } else if (platform === "linux") {
    try {
      execFileSync("apt-get", ["--version"], { stdio: "ignore" });
      console.log("[Lasso] Installing mkcert via apt-get...");
      const installResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const install = spawn("sudo", ["apt-get", "install", "-y", "mkcert"], { stdio: "inherit" });
        install.on("close", (code) => {
          if (code === 0) resolve({ ok: true });
          else resolve({ ok: false, error: `apt-get install failed with code ${code}` });
        });
        install.on("error", (error) => {
          resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      });
      if (installResult.ok) {
        execFileSync("mkcert", ["-install"], { stdio: "ignore" });
        console.log("[Lasso] ✓ mkcert installed and CA configured");
        return { ok: true };
      }
    } catch {
      try {
        execFileSync("dnf", ["--version"], { stdio: "ignore" });
        console.log("[Lasso] Installing mkcert via dnf...");
        const installResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
          const install = spawn("sudo", ["dnf", "install", "-y", "mkcert"], { stdio: "inherit" });
          install.on("close", (code) => {
            if (code === 0) resolve({ ok: true });
            else resolve({ ok: false, error: `dnf install failed with code ${code}` });
          });
          install.on("error", (error) => {
            resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
          });
        });
        if (installResult.ok) {
          execFileSync("mkcert", ["-install"], { stdio: "ignore" });
          console.log("[Lasso] ✓ mkcert installed and CA configured");
          return { ok: true };
        }
      } catch {
        console.log("[Lasso] Package manager not available, trying direct download...");
      }
    }
  }

  // Fallback: Download mkcert binary directly from GitHub
  console.log("[Lasso] Downloading mkcert binary from GitHub...");
  const downloadResult = await downloadMkcert();
  if (!downloadResult.ok || !downloadResult.path) {
    return { ok: false, error: downloadResult.error || "Failed to download mkcert binary" };
  }

  // Copy binary to a permanent location
  const binDir = path.join(os.homedir(), ".lasso", "bin");
  fs.mkdirSync(binDir, { recursive: true, mode: 0o755 });
  const mkcertPath = path.join(binDir, "mkcert");
  fs.copyFileSync(downloadResult.path, mkcertPath);
  fs.chmodSync(mkcertPath, 0o755);

  // Clean up temp file
  try {
    fs.unlinkSync(downloadResult.path);
  } catch {}

  // Install the local CA using the downloaded binary
  try {
    execFileSync(mkcertPath, ["-install"], { stdio: "inherit" });
    console.log("[Lasso] ✓ mkcert installed and CA configured");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function ensureHostCertificate(onProgress?: (message: string) => void): Promise<{ ok: boolean; trusted: boolean; error?: string }> {
  fs.mkdirSync(HOST_DIR, { recursive: true, mode: 0o700 });

  // Check if certificate exists and is trusted
  if (hasCertificate()) {
    const certStatus = hostCertificateStatus();
    console.log(`[Lasso] Certificate exists, trusted: ${certStatus.trusted}`);
    // If certificate exists but is not trusted and mkcert is available, regenerate it
    if (!certStatus.trusted && isMkcertInstalled()) {
      onProgress?.("Regenerating certificate with mkcert for trusted SSL...");
      try {
        fs.unlinkSync(TLS_CERT_FILE);
        fs.unlinkSync(TLS_KEY_FILE);
      } catch {}
    } else {
      return { ok: true, trusted: certStatus.trusted };
    }
  }

  onProgress?.("Generating SSL certificate...");

  // Try mkcert first - it creates system-trusted certificates
  if (!isMkcertInstalled()) {
    onProgress?.("mkcert not found, installing...");
    console.log("[Lasso] mkcert not found, attempting installation...");
    const installResult = await installMkcert();
    if (!installResult.ok) {
      console.warn(`[Lasso] ${installResult.error}`);
      console.warn("[Lasso] Falling back to OpenSSL (certificate will show as not secure)");
    }
  } else {
    console.log("[Lasso] mkcert is installed");
  }

  if (isMkcertInstalled()) {
    try {
      onProgress?.("Creating trusted certificate with mkcert...");
      const mkcertPath = getMkcertPath();
      console.log(`[Lasso] Using mkcert at: ${mkcertPath}`);
      execFileSync(mkcertPath, ["-cert-file", TLS_CERT_FILE, "-key-file", TLS_KEY_FILE, "localhost", "127.0.0.1", "::1", "*.lasso"], { stdio: "ignore" });
      fs.chmodSync(TLS_KEY_FILE, 0o600);
      onProgress?.("✓ SSL certificate ready (trusted)");
      return { ok: true, trusted: true };
    } catch (mkcertError) {
      console.warn("[Lasso] mkcert failed, falling back to OpenSSL:", mkcertError);
    }
  }

  // Fallback to OpenSSL - creates self-signed certificate (not trusted by browsers)
  const configFile = path.join(os.tmpdir(), `lasso-host-${process.pid}.cnf`);
  try {
    onProgress?.("Creating self-signed certificate with OpenSSL...");
    fs.writeFileSync(configFile, ["[req]", "distinguished_name = req_distinguished_name", "x509_extensions = v3_req", "prompt = no", "[req_distinguished_name]", "CN = *.lasso", "[v3_req]", "subjectAltName = DNS:*.lasso,DNS:localhost,IP:127.0.0.1,IP:::1", ""].join("\n"), { mode: 0o600 });
    execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-keyout", TLS_KEY_FILE, "-out", TLS_CERT_FILE, "-days", "825", "-config", configFile], { stdio: "ignore" });
    fs.chmodSync(TLS_KEY_FILE, 0o600);
    onProgress?.("✓ SSL certificate ready (self-signed)");
    return { ok: true, trusted: false };
  } catch (error) {
    return { ok: false, trusted: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    fs.rmSync(configFile, { force: true });
  }
}

export function hostCertificateStatus(): { present: boolean; certificate: string; key: string; trusted: boolean } {
  // Check if certificate was created by mkcert (trusted) or OpenSSL (self-signed)
  let trusted = false;
  if (hasCertificate()) {
    try {
      // Use openssl to check the issuer of the certificate
      const result = execFileSync("openssl", ["x509", "-noout", "-issuer", "-in", TLS_CERT_FILE], { encoding: "utf8" });
      // mkcert certificates have "mkcert" in the issuer
      trusted = result.toLowerCase().includes("mkcert");
    } catch {
      // If openssl fails, assume not trusted
    }
  }
  return { present: hasCertificate(), certificate: TLS_CERT_FILE, key: TLS_KEY_FILE, trusted };
}
