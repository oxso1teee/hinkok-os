export type RepositoryFinding = {
  code: string;
  line: number | null;
  message: string;
  path: string;
};

const SECRET_VARIABLES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SECRET",
  "DASHBOARD_PASSWORD",
  "API_SECRET",
  "OPENAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "GITHUB_TOKEN",
  "CRON_SECRET",
] as const;

const SECRET_PATTERNS = [
  {
    code: "openai_key",
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/g,
    message: "Possible OpenAI API key committed to the repository.",
  },
  {
    code: "anthropic_key",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g,
    message: "Possible Anthropic API key committed to the repository.",
  },
  {
    code: "github_token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g,
    message: "Possible GitHub token committed to the repository.",
  },
  {
    code: "telegram_token",
    pattern: /(?:^|[^0-9])\d{6,12}:[A-Za-z0-9_-]{30,}/g,
    message: "Possible Telegram bot token committed to the repository.",
  },
  {
    code: "jwt_token",
    pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    message: "Possible JWT committed to the repository.",
  },
] as const;

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function isClientModule(content: string): boolean {
  return /^\s*["']use client["'];/m.test(content.slice(0, 500));
}

export function forbiddenRepositoryPath(path: string): string | null {
  const normalized = normalizedPath(path);
  const basename = normalized.split("/").at(-1) ?? normalized;

  if (
    /(^|\/)\.env(?:\.|$)/.test(normalized) &&
    basename !== ".env.example"
  ) {
    return "Private environment files must never be committed.";
  }
  if (/\.(?:pem|key|p12|pfx)$/i.test(basename)) {
    return "Private key or certificate containers must never be committed.";
  }
  if (basename.toLowerCase().endsWith(".hinkok-backup")) {
    return "Encrypted HinkoK OS backups must never be committed.";
  }
  if (basename === ".npmrc") {
    return "A repository .npmrc is not allowed because it may carry registry credentials.";
  }

  return null;
}

export function scanRepositoryFile(
  path: string,
  content: string,
): RepositoryFinding[] {
  const normalized = normalizedPath(path);
  const findings: RepositoryFinding[] = [];
  const pathProblem = forbiddenRepositoryPath(normalized);
  if (pathProblem) {
    findings.push({
      code: "forbidden_path",
      line: null,
      message: pathProblem,
      path: normalized,
    });
  }

  for (const secret of SECRET_PATTERNS) {
    secret.pattern.lastIndex = 0;
    for (const match of content.matchAll(secret.pattern)) {
      findings.push({
        code: secret.code,
        line: lineAt(content, match.index),
        message: secret.message,
        path: normalized,
      });
    }
  }

  const privateKey =
    /-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{64,}\r?\n-----END PRIVATE KEY-----/.exec(
      content,
    );
  if (privateKey?.index !== undefined) {
    findings.push({
      code: "private_key",
      line: lineAt(content, privateKey.index),
      message: "Possible private key committed to the repository.",
      path: normalized,
    });
  }

  const assignmentPattern = new RegExp(
    `^[ \\t]*(${SECRET_VARIABLES.join("|")})=[^\\s#].+$`,
    "gm",
  );
  for (const match of content.matchAll(assignmentPattern)) {
    findings.push({
      code: "assigned_secret",
      line: lineAt(content, match.index),
      message: `${match[1]} has a committed non-empty value.`,
      path: normalized,
    });
  }

  if (isClientModule(content)) {
    for (const variable of SECRET_VARIABLES) {
      const index = content.indexOf(variable);
      if (index >= 0) {
        findings.push({
          code: "client_secret_reference",
          line: lineAt(content, index),
          message: `${variable} is referenced by a client module.`,
          path: normalized,
        });
      }
    }
  }

  return findings;
}
