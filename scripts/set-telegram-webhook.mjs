const [baseUrlArgument] = process.argv.slice(2);
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = (
  process.env.TELEGRAM_WEBHOOK_TOKEN ??
  process.env.TELEGRAM_WEBHOOK_SECRET
)?.trim();

if (!baseUrlArgument) {
  throw new Error(
    "Usage: npm run telegram:webhook:set -- https://your-domain.example",
  );
}

if (!token || !/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
  throw new Error("TELEGRAM_BOT_TOKEN is missing or invalid");
}

if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
  throw new Error("TELEGRAM_WEBHOOK_SECRET is missing or invalid");
}

const baseUrl = new URL(baseUrlArgument);

if (baseUrl.protocol !== "https:") {
  throw new Error("Telegram webhook URL must use HTTPS");
}

baseUrl.pathname = "/api/webhook/telegram";
baseUrl.search = new URLSearchParams({ token: secret }).toString();
baseUrl.hash = "";

const response = await fetch(
  `https://api.telegram.org/bot${token}/setWebhook`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: baseUrl.toString(),
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(20_000),
  },
);

const body = await response.json();

if (!response.ok || body?.ok !== true) {
  throw new Error("Telegram rejected the webhook configuration");
}

console.log(`Telegram webhook configured: ${baseUrl.toString()}`);
