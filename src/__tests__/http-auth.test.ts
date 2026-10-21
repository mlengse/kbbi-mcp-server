import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createKbbiServer, createHttpServer } from "../index.js";

const AUTH_TOKEN = "test-secret-token-123";

let server: http.Server;
let baseUrl: string;

before(async () => {
  const mcpServer = createKbbiServer();
  server = createHttpServer(mcpServer, AUTH_TOKEN);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("HTTP endpoint returning 404 for non-/mcp URL", async () => {
  const res = await fetch(`${baseUrl}/other`);
  assert.equal(res.status, 404);
  const body = await res.text();
  assert.ok(body.includes("Not Found"));
});

test("HTTP endpoint returning 401 when AUTH_TOKEN is set and no Authorization header is provided", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
  });
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.deepEqual(json, { error: "Unauthorized" });
});

test("HTTP endpoint returning 401 when Authorization header token is invalid", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer wrong-token",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
  });
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.deepEqual(json, { error: "Unauthorized" });
});

test("HTTP endpoint allowing request when valid Authorization header is provided", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
      id: 1,
    }),
  });
  assert.notEqual(res.status, 401);
  assert.notEqual(res.status, 404);
  // Expected response from StreamableHTTPServerTransport
  assert.equal(res.status, 200);
});

test("createHttpServer returns http.Server instance and allows requests without authToken when authToken is omitted", async () => {
  const dummyServer = new McpServer({ name: "dummy-mcp", version: "0.0.1" });
  const srv = createHttpServer(dummyServer);
  assert.ok(srv instanceof http.Server);

  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address() as { port: number };
  const dummyUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const res = await fetch(`${dummyUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
        id: 1,
      }),
    });
    assert.equal(res.status, 200);
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
});

test("createHttpServer handles premature client disconnection gracefully", async () => {
  const dummyServer = new McpServer({ name: "dummy-mcp-disconnect", version: "0.0.1" });
  const srv = createHttpServer(dummyServer);
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address() as { port: number };

  const controller = new AbortController();
  try {
    const reqPromise = fetch(`http://127.0.0.1:${addr.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
        id: 1,
      }),
      signal: controller.signal,
    });
    controller.abort();
    await reqPromise.catch(() => {});
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
});
