import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";

import {
  E2E_APP_HOST,
  E2E_APP_PORT,
  E2E_PASSWORD,
  E2E_SUPABASE_HOST,
  E2E_SUPABASE_ORIGIN,
  E2E_SUPABASE_PORT,
} from "../e2e/constants";
import { createCiBuildEnvironment } from "../src/lib/ci/environment";

const MAX_MOCK_BODY_BYTES = 16 * 1024;

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

async function readBoundedBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_MOCK_BODY_BYTES) {
      throw new Error("Mock request body exceeded its limit.");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function handleSupabaseRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", E2E_SUPABASE_ORIGIN);

  if (
    request.method === "POST" &&
    url.pathname === "/rest/v1/rpc/register_login_attempt"
  ) {
    const body = await readBoundedBody(request);
    if (!isObject(body) || typeof body.p_ok !== "boolean") {
      sendJson(response, 400, {
        code: "PGRST102",
        message: "Invalid E2E RPC payload.",
      });
      return;
    }

    sendJson(response, 200, true);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/rest/v1/audit_log"
  ) {
    const body = await readBoundedBody(request);
    if (!isObject(body) || typeof body.action !== "string") {
      sendJson(response, 400, {
        code: "PGRST102",
        message: "Invalid E2E audit payload.",
      });
      return;
    }

    response.writeHead(201, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end();
    return;
  }

  sendJson(response, 404, {
    code: "PGRST404",
    message: "The E2E Supabase mock rejects undeclared operations.",
  });
}

function createE2eEnvironment(): NodeJS.ProcessEnv {
  return {
    ...createCiBuildEnvironment(process.env),
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_ORIGIN,
    DASHBOARD_PASSWORD: E2E_PASSWORD,
    USER_ID: "hinkok_e2e_operator",
    USER_TIMEZONE: "Europe/Riga",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

async function closeMockServer(
  server: ReturnType<typeof createServer>,
): Promise<void> {
  await new Promise<void>((resolveClose) => {
    server.close(() => resolveClose());
    server.closeAllConnections();
  });
}

function stopChild(child: ChildProcess): void {
  if (!child.killed) child.kill("SIGTERM");
}

async function main(): Promise<void> {
  const mockServer = createServer((request, response) => {
    void handleSupabaseRequest(request, response).catch(() => {
      if (!response.headersSent) {
        sendJson(response, 400, {
          code: "PGRST102",
          message: "The E2E Supabase mock rejected the request.",
        });
      } else {
        response.destroy();
      }
    });
  });

  mockServer.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    mockServer.once("error", rejectListen);
    mockServer.listen(
      E2E_SUPABASE_PORT,
      E2E_SUPABASE_HOST,
      resolveListen,
    );
  });

  const nextCli = resolve(process.cwd(), "node_modules/next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [
      nextCli,
      "dev",
      "--hostname",
      E2E_APP_HOST,
      "--port",
      String(E2E_APP_PORT),
    ],
    {
      cwd: process.cwd(),
      env: createE2eEnvironment(),
      stdio: "inherit",
    },
  );

  const shutdown = (): void => {
    stopChild(child);
    void closeMockServer(mockServer);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => {
      if (signal === "SIGTERM" || signal === "SIGINT") {
        resolveExit(0);
        return;
      }
      resolveExit(code ?? 1);
    });
  });

  await closeMockServer(mockServer);
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`E2E server failed: ${message}\n`);
  process.exitCode = 1;
});
