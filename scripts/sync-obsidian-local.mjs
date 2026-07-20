import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE_FILE = ".hinkok-sync-state.json";
const MAX_NOTE_BYTES = 2 * 1024 * 1024;
const MAX_BATCH_BYTES = 3 * 1024 * 1024;
const MAX_BATCH_FILES = 40;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".obsidian",
  ".trash",
  "trash",
  "trashes",
  "корзина",
]);

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function deploymentUrl(value) {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (url.username || url.password || (url.protocol !== "https:" && !local)) {
    throw new Error("HINKOK_OS_URL must be a safe HTTPS origin");
  }

  return url.origin;
}

function normalizedRelativePath(root, absolutePath) {
  const relative = path.relative(root, absolutePath).split(path.sep).join("/");

  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error("A note resolved outside the configured Obsidian vault");
  }

  return relative.normalize("NFC");
}

async function collectMarkdownFiles(root, directory = root, output = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name.toLocaleLowerCase("ru-RU"))) {
        await collectMarkdownFiles(root, absolutePath, output);
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLocaleLowerCase("en-US").endsWith(".md")) {
      output.push(absolutePath);
    }
  }

  return output;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readState(statePath) {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8"));

    if (parsed?.version !== 1 || typeof parsed.files !== "object" || !parsed.files) {
      return { version: 1, files: {} };
    }

    return { version: 1, files: parsed.files };
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return { version: 1, files: {} };
    }
    throw error;
  }
}

function createBatches(files, deletedPaths) {
  const batches = [];
  let current = { files: [], deletedPaths: [] };
  let currentBytes = 0;

  const flush = () => {
    if (current.files.length || current.deletedPaths.length) batches.push(current);
    current = { files: [], deletedPaths: [] };
    currentBytes = 0;
  };

  for (const file of files) {
    const size = Buffer.byteLength(file.content, "utf8") + Buffer.byteLength(file.path, "utf8");
    if (current.files.length >= MAX_BATCH_FILES || currentBytes + size > MAX_BATCH_BYTES) flush();
    current.files.push({ path: file.path, content: file.content });
    currentBytes += size;
  }

  for (const deletedPath of deletedPaths) {
    if (current.deletedPaths.length >= 200) flush();
    current.deletedPaths.push(deletedPath);
  }

  flush();
  return batches;
}

async function sendBatch(origin, apiSecret, batch) {
  const response = await fetch(`${origin}/api/sync/obsidian`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Secret": apiSecret,
    },
    body: JSON.stringify(batch),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || body?.ok !== true) {
    throw new Error(`Obsidian sync failed with HTTP ${response.status}: ${body?.error ?? "unknown_error"}`);
  }

  return body;
}

async function main() {
  const origin = deploymentUrl(requiredEnvironment("HINKOK_OS_URL"));
  const apiSecret = requiredEnvironment("HINKOK_API_SECRET");
  const vaultPath = path.resolve(requiredEnvironment("OBSIDIAN_VAULT_PATH"));
  const vaultStats = await stat(vaultPath);

  if (!vaultStats.isDirectory()) {
    throw new Error("OBSIDIAN_VAULT_PATH must point to a directory");
  }

  const statePath = path.join(vaultPath, STATE_FILE);
  const previous = await readState(statePath);
  const absoluteFiles = await collectMarkdownFiles(vaultPath);
  const currentFiles = {};
  const changedFiles = [];

  for (const absolutePath of absoluteFiles) {
    const fileStats = await stat(absolutePath);

    if (fileStats.size > MAX_NOTE_BYTES) {
      throw new Error(`Obsidian note exceeds ${MAX_NOTE_BYTES} bytes: ${absolutePath}`);
    }

    const content = await readFile(absolutePath, "utf8");
    const relativePath = normalizedRelativePath(vaultPath, absolutePath);
    const hash = sha256(content);
    currentFiles[relativePath] = hash;

    if (previous.files[relativePath] !== hash) {
      changedFiles.push({ path: relativePath, content });
    }
  }

  const deletedPaths = Object.keys(previous.files).filter(
    (relativePath) => !(relativePath in currentFiles),
  );
  const batches = createBatches(changedFiles, deletedPaths);
  const totals = { indexedFiles: 0, deletedFiles: 0, chunkCount: 0, embeddedCount: 0, reusedCount: 0 };

  for (const batch of batches) {
    const result = await sendBatch(origin, apiSecret, batch);
    for (const key of Object.keys(totals)) totals[key] += Number(result[key] ?? 0);
  }

  await writeFile(
    statePath,
    `${JSON.stringify({ version: 1, files: currentFiles }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );

  process.stdout.write(
    `HinkoK OS Obsidian sync completed: ${JSON.stringify({ changedFiles: changedFiles.length, removedFiles: deletedPaths.length, ...totals })}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown synchronization error";
  process.stderr.write(`HinkoK OS Obsidian sync failed: ${message}\n`);
  process.exitCode = 1;
});
