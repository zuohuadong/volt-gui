import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopDir = path.join(rootDir, "apps", "desktop-electron");
const destination = path.join(desktopDir, ".speech-runtime", "sensevoice");
const DOWNLOAD_ATTEMPTS = 3;
function speechPackageDir() {
  const desktopRequire = createRequire(path.join(desktopDir, "package.json"));
  const dshRequire = createRequire(desktopRequire.resolve("@deepseek-ai/dsh/package.json"));
  return path.dirname(dshRequire.resolve("@deepseek-ai/dsh-experimental-speech-to-text-sensevoice/package.json"));
}

export function speechAssetPlan(packageDir = speechPackageDir()) {
  const assets = JSON.parse(fs.readFileSync(path.join(packageDir, "runtime", "assets.json"), "utf8"));
  const files = [
    { key: "model", ...assets.models.int8 },
    { key: "tokens", ...assets.tokens },
    { key: "vad", ...assets.vad },
  ];
  for (const file of files) {
    if (!file.name || !file.url || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/u.test(file.sha256)) {
      throw new Error("Speech model manifest is invalid");
    }
  }
  return files;
}

function mirrors(url) {
  const fallback = process.env.ANYONG_SPEECH_MODEL_MIRROR?.trim();
  const values = [url, ...(fallback ? [fallback] : [])];
  if (url.startsWith("https://huggingface.co/")) {
    values.push(url.replace("https://huggingface.co/", "https://hf-mirror.com/"));
  }
  return [...new Set(values)];
}

function digestFile(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function download(file, target, cache) {
  if (fs.existsSync(target)) {
    const size = fs.statSync(target).size;
    if (size === file.bytes && await digestFile(target) === file.sha256) {
      console.log(`Speech model cache hit: ${file.name}`);
      return;
    }
    await rm(target, { force: true });
  }
  const cached = path.join(cache, file.sha256);
  if (fs.existsSync(cached)) {
    if (fs.statSync(cached).size === file.bytes && await digestFile(cached) === file.sha256) {
      await fs.promises.copyFile(cached, target);
      console.log(`Speech model cache restored: ${file.name}`);
      return;
    }
    await rm(cached, { force: true });
  }
  await mkdir(path.dirname(target), { recursive: true });
  await mkdir(cache, { recursive: true });
  const temporary = `${target}.${process.pid}.download`;
  let lastError = "unknown error";
  for (const url of mirrors(file.url)) {
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
      try {
        console.log(`Downloading speech model: ${file.name} from ${new URL(url).hostname} (attempt ${attempt})`);
        const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30 * 60_000) });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        let received = 0;
        let lastHeartbeat = Date.now();
        const progress = new Transform({
          transform(chunk, _encoding, callback) {
            received += chunk.length;
            if (Date.now() - lastHeartbeat >= 15_000) {
              console.log(`${file.name}: ${(received / 1_048_576).toFixed(1)} MiB received`);
              lastHeartbeat = Date.now();
            }
            callback(null, chunk);
          },
        });
        await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(temporary, { mode: 0o600 }));
        const size = fs.statSync(temporary).size;
        if (size !== file.bytes) throw new Error(`size ${size} != ${file.bytes}`);
        const sha256 = await digestFile(temporary);
        if (sha256 !== file.sha256) throw new Error("SHA-256 mismatch");
        await rename(temporary, target);
        await fs.promises.copyFile(target, cached);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await rm(temporary, { force: true });
        console.warn(`Speech model download failed (${file.name}): ${lastError}`);
        if (attempt < DOWNLOAD_ATTEMPTS) {
          const delay = /HTTP 429/u.test(lastError) ? attempt * 30_000 : attempt * 2_000;
          console.log(`Retrying speech model ${file.name} in ${delay / 1000}s`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }
  throw new Error(`Unable to download speech model ${file.name}: ${lastError}`);
}

export async function stageSpeechModel({ target = destination, cache = process.env.ANYONG_SPEECH_MODEL_CACHE || path.join(desktopDir, ".runtime-cache", "speech"), packageDir = speechPackageDir() } = {}) {
  const assets = speechAssetPlan(packageDir);
  await mkdir(target, { recursive: true });
  for (const file of assets) await download(file, path.join(target, file.name), cache);
  for (const file of assets) {
    const staged = path.join(target, file.name);
    if (!fs.existsSync(staged) || fs.statSync(staged).size !== file.bytes || await digestFile(staged) !== file.sha256) {
      throw new Error(`Speech model verification failed: ${file.name}`);
    }
  }
  console.log(`Speech model ready: ${target}`);
}

if (pathToFileURL(path.resolve(process.argv[1] || "")).href === import.meta.url) {
  await stageSpeechModel();
}
