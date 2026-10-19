#!/usr/bin/env node

import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { fileURLToPath } from "node:url";

import { registerStemmerTools } from "./tools/stemmer.js";
import { registerPemenggalanTools } from "./tools/pemenggalan.js";
import { registerKamusTools } from "./tools/kamus.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

// ============================================================
// KBBI MCP Server
// Data kamus bahasa Indonesia untuk training stemmer
// dan pemenggalan kata via Model Context Protocol.
// ============================================================

export function createKbbiServer(): McpServer {
  const server = new McpServer({
    name: "kbbi-mcp-server",
    version: "1.0.0",
  });

  // Register all primitives
  registerStemmerTools(server);
  registerPemenggalanTools(server);
  registerKamusTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}

export function createHttpServer(server: McpServer, authToken?: string): http.Server {
  return http.createServer(async (req, res) => {
    // Only handle /mcp endpoint
    if (req.url !== "/mcp") {
      res.writeHead(404);
      res.end("Not Found. Use /mcp endpoint.");
      return;
    }

    // Check authentication if authToken is provided
    if (authToken) {
      const authHeader = req.headers["authorization"];
      if (!authHeader || authHeader !== `Bearer ${authToken}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    res.on("close", () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
}

// ============================================================
// Transport Setup
// ============================================================

async function main(): Promise<void> {
  const server = createKbbiServer();
  const mode = process.argv.includes("--http") ? "http" : "stdio";

  if (mode === "http") {
    // HTTP transport for remote access
    const PORT = parseInt(process.env.PORT || "3000", 10);
    const authToken = process.env.AUTH_TOKEN || process.env.MCP_AUTH_TOKEN;

    const httpServer = createHttpServer(server, authToken);

    httpServer.listen(PORT, () => {
      console.error(`KBBI MCP Server (HTTP) listening on port ${PORT}`);
      console.error(`Endpoint: http://localhost:${PORT}/mcp`);
    });
  } else {
    // Stdio transport (default) for local clients
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("KBBI MCP Server (stdio) started");
  }
}

// Jalankan hanya saat file ini dijalankan langsung (bukan di-import untuk test).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
