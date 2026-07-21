export type DeploymentProfile = "core" | "full";

export type DeploymentEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type DeploymentIssue = {
  code: string;
  variable?: string;
  message: string;
};

export type DeploymentIntegration = {
  name: "telegram" | "google" | "obsidian";
  configured: boolean;
  required: boolean;
};

export type DeploymentReport = {
  ok: boolean;
  profile: DeploymentProfile;
  errors: DeploymentIssue[];
  warnings: DeploymentIssue[];
  integrations: DeploymentIntegration[];
};

const CORE_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "USER_ID",
  "USER_TIMEZONE",
  "AUTH_SECRET",
  "DASHBOARD_PASSWORD",
  "API_SECRET",
  "OPENAI_API_KEY",
  "CRON_SECRET",
] as const;

const OPTIONAL_GROUPS = {
  telegram: [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_USER_ID",
  ],
  google: [
    "GOOGLE_CALENDAR_ID",
    "GOOGLE_SHEETS_FINANCE_ID",
  ],
  obsidian: ["GITHUB_TOKEN", "OBSIDIAN_REPO", "OBSIDIAN_VAULT_NAME"],
} as const;

const SECRET_VARIABLES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SECRET",
  "DASHBOARD_PASSWORD",
  "API_SECRET",
  "OPENAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
  "GITHUB_TOKEN",
  "CRON_SECRET",
  "RECOVERY_CODE",
  "SCHEDULED_BACKUP_PASSPHRASE",
  "SENTRY_DSN",
] as const;

const PLACEHOLDER_PATTERNS = [
  /^changeme$/i,
  /^replace[-_ ]?me$/i,
  /^your[-_ ]/i,
  /^dummy/i,
  /^test[-_ ]?secret/i,
  /^example[-_ ]?secret/i,
  /^x{8,}$/i,
  /build[-_ ]?only/i,
  /runtime[-_ ]?only/i,
] as const;

function clean(environment: DeploymentEnvironment, name: string): string {
  return environment[name]?.trim() ?? "";
}

function isConfigured(
  environment: DeploymentEnvironment,
  variables: readonly string[],
): boolean {
  return variables.every((name) => clean(environment, name).length > 0);
}

function hasAnyConfigured(
  environment: DeploymentEnvironment,
  variables: readonly string[],
): boolean {
  return variables.some((name) => clean(environment, name).length > 0);
}

function looksLikePlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function addMissingError(
  errors: DeploymentIssue[],
  variable: string,
): void {
  errors.push({
    code: "missing_variable",
    variable,
    message: `${variable} is required for this deployment profile.`,
  });
}

function validateSecret(
  environment: DeploymentEnvironment,
  errors: DeploymentIssue[],
  variable: string,
  minimumLength: number,
): void {
  const value = clean(environment, variable);
  if (!value) return;

  if (value.length < minimumLength) {
    errors.push({
      code: "secret_too_short",
      variable,
      message: `${variable} must contain at least ${minimumLength} characters.`,
    });
  }

  if (looksLikePlaceholder(value)) {
    errors.push({
      code: "placeholder_secret",
      variable,
      message: `${variable} still looks like a placeholder.`,
    });
  }
}

function validateCore(
  environment: DeploymentEnvironment,
  errors: DeploymentIssue[],
): void {
  for (const variable of CORE_VARIABLES) {
    if (!clean(environment, variable)) addMissingError(errors, variable);
  }

  const supabaseUrl = clean(environment, "NEXT_PUBLIC_SUPABASE_URL");
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error("unsafe URL");
      }
    } catch {
      errors.push({
        code: "invalid_supabase_url",
        variable: "NEXT_PUBLIC_SUPABASE_URL",
        message:
          "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin without credentials, a path, query or fragment.",
      });
    }
  }

  const userId = clean(environment, "USER_ID");
  if (userId && !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    errors.push({
      code: "invalid_user_id",
      variable: "USER_ID",
      message:
        "USER_ID may contain only letters, numbers, underscores and hyphens.",
    });
  }

  const timeZone = clean(environment, "USER_TIMEZONE");
  if (timeZone && !isValidTimeZone(timeZone)) {
    errors.push({
      code: "invalid_timezone",
      variable: "USER_TIMEZONE",
      message: "USER_TIMEZONE must be a valid IANA timezone.",
    });
  }

  validateSecret(environment, errors, "SUPABASE_SERVICE_ROLE_KEY", 20);
  validateSecret(environment, errors, "AUTH_SECRET", 64);
  validateSecret(environment, errors, "DASHBOARD_PASSWORD", 20);
  validateSecret(environment, errors, "API_SECRET", 32);
  validateSecret(environment, errors, "OPENAI_API_KEY", 20);
  validateSecret(environment, errors, "CRON_SECRET", 32);
  validateSecret(environment, errors, "RECOVERY_CODE", 32);
  validateSecret(environment, errors, "SCHEDULED_BACKUP_PASSPHRASE", 16);

  const embeddingModel =
    clean(environment, "OPENAI_EMBEDDING_MODEL") ||
    "text-embedding-3-small";
  if (embeddingModel !== "text-embedding-3-small") {
    errors.push({
      code: "invalid_embedding_model",
      variable: "OPENAI_EMBEDDING_MODEL",
      message:
        "OPENAI_EMBEDDING_MODEL must be text-embedding-3-small because the database uses vector(1536).",
    });
  }

  const anonKey = clean(environment, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = clean(environment, "SUPABASE_SERVICE_ROLE_KEY");
  if (anonKey && serviceRoleKey && anonKey === serviceRoleKey) {
    errors.push({
      code: "service_role_exposed",
      variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      message:
        "NEXT_PUBLIC_SUPABASE_ANON_KEY must never contain the service-role key.",
    });
  }
}

function validateGroups(
  environment: DeploymentEnvironment,
  profile: DeploymentProfile,
  errors: DeploymentIssue[],
  warnings: DeploymentIssue[],
): DeploymentIntegration[] {
  const integrations = Object.entries(OPTIONAL_GROUPS).map(
    ([name, variables]) => {
      const configured = isConfigured(environment, variables);
      const anyConfigured = hasAnyConfigured(environment, variables);
      const required = profile === "full";

      if (anyConfigured && !configured) {
        errors.push({
          code: "partial_integration",
          variable: variables.join(","),
          message: `${name} integration is only partially configured.`,
        });
      } else if (required && !configured) {
        for (const variable of variables) {
          if (!clean(environment, variable)) addMissingError(errors, variable);
        }
      } else if (!required && !configured) {
        warnings.push({
          code: "integration_disabled",
          variable: variables.join(","),
          message: `${name} integration is disabled in the core profile.`,
        });
      }

      return {
        name: name as DeploymentIntegration["name"],
        configured,
        required,
      };
    },
  );

  validateSecret(environment, errors, "ANTHROPIC_API_KEY", 20);
  validateSecret(environment, errors, "TELEGRAM_WEBHOOK_SECRET", 32);
  validateSecret(environment, errors, "GITHUB_TOKEN", 20);

  const telegramToken = clean(environment, "TELEGRAM_BOT_TOKEN");
  if (telegramToken && !/^\d+:[A-Za-z0-9_-]{30,}$/.test(telegramToken)) {
    errors.push({
      code: "invalid_telegram_token",
      variable: "TELEGRAM_BOT_TOKEN",
      message: "TELEGRAM_BOT_TOKEN has an invalid format.",
    });
  }

  const telegramUserId = clean(environment, "TELEGRAM_USER_ID");
  if (telegramUserId && !/^\d+$/.test(telegramUserId)) {
    errors.push({
      code: "invalid_telegram_user",
      variable: "TELEGRAM_USER_ID",
      message: "TELEGRAM_USER_ID must contain digits only.",
    });
  }

  if (
    clean(environment, "SCHEDULED_BACKUP_PASSPHRASE") &&
    !isConfigured(environment, OPTIONAL_GROUPS.telegram)
  ) {
    warnings.push({
      code: "scheduled_backup_without_delivery",
      variable: "SCHEDULED_BACKUP_PASSPHRASE",
      message:
        "SCHEDULED_BACKUP_PASSPHRASE is set but Telegram is not configured, so the weekly cron backup has nowhere to deliver the file.",
    });
  }

  const sentryDsn = clean(environment, "SENTRY_DSN");
  if (sentryDsn) {
    try {
      new URL(sentryDsn);
    } catch {
      errors.push({
        code: "invalid_sentry_dsn",
        variable: "SENTRY_DSN",
        message: "SENTRY_DSN must be a valid URL.",
      });
    }
  }

  const serviceAccountVariables = [
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SERVICE_ACCOUNT_KEY",
  ] as const;
  const oauthVariables = [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
    "GOOGLE_TOKEN_ENCRYPTION_KEY",
  ] as const;
  const serviceAccountConfigured = isConfigured(environment, serviceAccountVariables);
  const serviceAccountPartial = hasAnyConfigured(environment, serviceAccountVariables) && !serviceAccountConfigured;
  const oauthConfigured = isConfigured(environment, oauthVariables);
  const oauthPartial = hasAnyConfigured(environment, oauthVariables) && !oauthConfigured;
  const googleResourcesConfigured = isConfigured(environment, OPTIONAL_GROUPS.google);

  if (serviceAccountPartial) {
    errors.push({
      code: "partial_integration",
      variable: serviceAccountVariables.join(","),
      message: "Google service-account credentials are only partially configured.",
    });
  }
  if (oauthPartial) {
    errors.push({
      code: "partial_integration",
      variable: oauthVariables.join(","),
      message: "Google OAuth credentials are only partially configured.",
    });
  }
  if (googleResourcesConfigured && !serviceAccountConfigured && !oauthConfigured) {
    errors.push({
      code: "missing_google_auth",
      variable: [...serviceAccountVariables, ...oauthVariables].join(","),
      message: "Google requires either a complete service account or a complete OAuth client.",
    });
  }

  validateSecret(environment, errors, "GOOGLE_OAUTH_CLIENT_SECRET", 16);
  validateSecret(environment, errors, "GOOGLE_TOKEN_ENCRYPTION_KEY", 43);

  const oauthRedirect = clean(environment, "GOOGLE_OAUTH_REDIRECT_URI");
  if (oauthRedirect) {
    try {
      const parsed = new URL(oauthRedirect);
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("unsafe");
    } catch {
      errors.push({
        code: "invalid_google_redirect",
        variable: "GOOGLE_OAUTH_REDIRECT_URI",
        message: "GOOGLE_OAUTH_REDIRECT_URI must be an HTTPS URL (or localhost for development).",
      });
    }
  }

  const googleEmail = clean(environment, "GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (
    googleEmail &&
    !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/i.test(googleEmail)
  ) {
    errors.push({
      code: "invalid_google_email",
      variable: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      message:
        "GOOGLE_SERVICE_ACCOUNT_EMAIL must be a service-account email.",
    });
  }

  const googleKey = clean(environment, "GOOGLE_SERVICE_ACCOUNT_KEY").replace(
    /\\n/g,
    "\n",
  );
  if (
    googleKey &&
    (!googleKey.includes("-----BEGIN PRIVATE KEY-----") ||
      !googleKey.includes("-----END PRIVATE KEY-----"))
  ) {
    errors.push({
      code: "invalid_google_key",
      variable: "GOOGLE_SERVICE_ACCOUNT_KEY",
      message:
        "GOOGLE_SERVICE_ACCOUNT_KEY must contain a complete PKCS#8 private key.",
    });
  }

  const financeCurrency =
    clean(environment, "GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY") || "EUR";
  if (!/^[A-Za-z]{3}$/.test(financeCurrency)) {
    errors.push({
      code: "invalid_finance_currency",
      variable: "GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY",
      message:
        "GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY must be a three-letter code.",
    });
  }

  const obsidianRepo = clean(environment, "OBSIDIAN_REPO");
  if (
    obsidianRepo &&
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(obsidianRepo)
  ) {
    errors.push({
      code: "invalid_obsidian_repo",
      variable: "OBSIDIAN_REPO",
      message: "OBSIDIAN_REPO must use owner/repository format.",
    });
  }

  const vaultName = clean(environment, "OBSIDIAN_VAULT_NAME");
  if (vaultName && (vaultName.includes("/") || vaultName.includes("\\"))) {
    errors.push({
      code: "invalid_vault_name",
      variable: "OBSIDIAN_VAULT_NAME",
      message: "OBSIDIAN_VAULT_NAME must be one folder name.",
    });
  }

  return integrations;
}

function validateSecretSeparation(
  environment: DeploymentEnvironment,
  errors: DeploymentIssue[],
): void {
  const owners = new Map<string, string>();

  for (const variable of SECRET_VARIABLES) {
    const value = clean(environment, variable);
    if (!value) continue;

    const previous = owners.get(value);
    if (previous) {
      errors.push({
        code: "reused_secret",
        variable: `${previous},${variable}`,
        message: `${previous} and ${variable} must use different values.`,
      });
    } else {
      owners.set(value, variable);
    }
  }
}

export function checkDeploymentEnvironment(
  environment: DeploymentEnvironment,
  profile: DeploymentProfile = "full",
): DeploymentReport {
  const errors: DeploymentIssue[] = [];
  const warnings: DeploymentIssue[] = [];

  validateCore(environment, errors);
  const integrations = validateGroups(
    environment,
    profile,
    errors,
    warnings,
  );
  validateSecretSeparation(environment, errors);

  return {
    ok: errors.length === 0,
    profile,
    errors,
    warnings,
    integrations,
  };
}
