import "server-only";

import { z } from "zod";

import { isObsidianConfigured, obsidianEnv } from "@/lib/env/obsidian";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
const MAX_TREE_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_BLOB_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MAX_OBSIDIAN_FILES = 5_000;
export const MAX_OBSIDIAN_NOTE_BYTES = 2 * 1024 * 1024;

const gitTreeEntrySchema = z
  .object({
    path: z.string().min(1).max(1024),
    mode: z.string(),
    type: z.enum(["blob", "tree", "commit"]),
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    size: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const gitTreeSchema = z
  .object({
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    truncated: z.boolean().default(false),
    tree: z.array(gitTreeEntrySchema).max(100_000),
  })
  .passthrough();

const gitBlobSchema = z
  .object({
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    size: z.number().int().nonnegative(),
    encoding: z.literal("base64"),
    content: z.string().max(3_000_000),
  })
  .passthrough();

export type GitHubTreeEntry = z.infer<typeof gitTreeEntrySchema>;

export type GitHubTree = {
  sha: string;
  entries: GitHubTreeEntry[];
};

function configuredRepository(): {
  token: string;
  owner: string;
  repository: string;
  branch: string;
} {
  if (
    !isObsidianConfigured() ||
    !obsidianEnv.GITHUB_TOKEN ||
    !obsidianEnv.OBSIDIAN_REPO
  ) {
    throw new Error("Obsidian GitHub integration is not configured");
  }

  const [owner, repository] = obsidianEnv.OBSIDIAN_REPO.split("/", 2);

  return {
    token: obsidianEnv.GITHUB_TOKEN,
    owner,
    repository,
    branch: obsidianEnv.OBSIDIAN_BRANCH,
  };
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function githubRequest(path: string): Promise<Response> {
  const repository = configuredRepository();
  const url = new URL(path, GITHUB_API_ORIGIN);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${repository.token}`,
          "User-Agent": "hinkok-os/0.1.0",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        return response;
      }

      if (!retryableStatus(response.status) || attempt === MAX_ATTEMPTS) {
        throw new Error(`GitHub API request failed with status ${response.status}`);
      }

      await response.body?.cancel();
    } catch (error: unknown) {
      lastError = error;

      if (attempt === MAX_ATTEMPTS) {
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }

  throw new Error("GitHub API request failed after retries", {
    cause: lastError,
  });
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("GitHub API response exceeds the configured size limit");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (bytes.byteLength > maximumBytes) {
    throw new Error("GitHub API response exceeds the configured size limit");
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error: unknown) {
    throw new Error("GitHub API returned invalid JSON", { cause: error });
  }
}

function repositoryApiPrefix(): string {
  const { owner, repository } = configuredRepository();
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
}

export async function getGitHubTree(): Promise<GitHubTree> {
  const { branch } = configuredRepository();
  const response = await githubRequest(
    `${repositoryApiPrefix()}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const parsed = gitTreeSchema.safeParse(
    await readBoundedJson(response, MAX_TREE_RESPONSE_BYTES),
  );

  if (!parsed.success) {
    throw new Error("GitHub returned an invalid repository tree");
  }

  if (parsed.data.truncated) {
    throw new Error("GitHub repository tree is truncated; sync aborted");
  }

  if (parsed.data.tree.length > MAX_OBSIDIAN_FILES) {
    throw new Error(
      `GitHub repository exceeds the ${MAX_OBSIDIAN_FILES}-entry sync limit`,
    );
  }

  return { sha: parsed.data.sha, entries: parsed.data.tree };
}

export async function getGitHubBlobText(
  sha: string,
  expectedSize?: number,
): Promise<string> {
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("Invalid Git blob SHA");
  }

  if (expectedSize !== undefined && expectedSize > MAX_OBSIDIAN_NOTE_BYTES) {
    throw new Error("Obsidian note exceeds the configured size limit");
  }

  const response = await githubRequest(
    `${repositoryApiPrefix()}/git/blobs/${sha}`,
  );
  const parsed = gitBlobSchema.safeParse(
    await readBoundedJson(response, MAX_BLOB_RESPONSE_BYTES),
  );

  if (!parsed.success || parsed.data.sha !== sha) {
    throw new Error("GitHub returned an invalid Git blob");
  }

  if (parsed.data.size > MAX_OBSIDIAN_NOTE_BYTES) {
    throw new Error("Obsidian note exceeds the configured size limit");
  }

  const bytes = Buffer.from(parsed.data.content.replace(/\s/g, ""), "base64");

  if (bytes.byteLength !== parsed.data.size) {
    throw new Error("GitHub blob size does not match its content");
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error: unknown) {
    throw new Error("Obsidian note is not valid UTF-8", { cause: error });
  }
}
