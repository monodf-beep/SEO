#!/usr/bin/env node

/**
 * CrawlSEO MCP Server — streamable HTTP transport.
 *
 * Same ten tools as mcp/server.ts, served over HTTP so remote MCP clients
 * (claude.ai custom connectors, Claude Desktop, Claude mobile) can connect
 * without spawning a local process. Exists because Windows OpenSSH dies
 * silently when spawned console-less by Claude Desktop, which rules the
 * stdio-over-ssh transport out on that platform.
 *
 * Auth model: Claude custom connectors only speak "no auth" or full OAuth,
 * so the endpoint is protected by a capability URL — a random secret as the
 * path prefix, same trust model as a webhook URL:
 *
 *   POST https://<host>/<MCP_HTTP_SECRET>/mcp
 *
 * Anything without the exact prefix gets a bare 404. Run behind TLS only.
 *
 * Env: MCP_HTTP_SECRET (required, hex >= 32 chars), PORT (default 8788),
 *      DATABASE_URL (required, read by lib/db).
 *
 * Run: npx tsx mcp/http-server.ts
 */

import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { buildServer } from "./server";

const SECRET = process.env.MCP_HTTP_SECRET ?? "";
if (SECRET.length < 32) {
  console.error(
    "MCP_HTTP_SECRET must be set to a random string of at least 32 chars " +
      "(openssl rand -hex 32). Refusing to start without it."
  );
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 8788);
const MCP_PATH = `/${SECRET}/mcp`;

// One transport per MCP session. Sessions are created on an initialize
// request and torn down when the client closes them (DELETE) or on error.
const transports = new Map<string, StreamableHTTPServerTransport>();

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handleMcp(req: IncomingMessage, res: ServerResponse) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400).end("bad request");
      return;
    }

    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (!isInitializeRequest(body)) {
        res
          .writeHead(400, { "content-type": "application/json" })
          .end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32000, message: "No valid session. Send initialize first." },
              id: null,
            })
          );
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      await buildServer().connect(transport);
    }

    await transport.handleRequest(req, res, body);
    return;
  }

  if (req.method === "GET" || req.method === "DELETE") {
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.writeHead(400).end("no session");
      return;
    }
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(405).end();
}

const httpServer = createHttpServer((req, res) => {
  const url = (req.url ?? "").split("?")[0];

  if (url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }

  if (url === MCP_PATH) {
    handleMcp(req, res).catch((err) => {
      console.error("MCP request failed:", err);
      if (!res.headersSent) res.writeHead(500).end("internal error");
    });
    return;
  }

  // Wrong or missing secret: reveal nothing.
  res.writeHead(404).end("not found");
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.error(`CrawlSEO MCP server (streamable HTTP) listening on :${PORT}`);
  console.error(`Endpoint path: /<secret>/mcp  |  Health: /healthz`);
});
