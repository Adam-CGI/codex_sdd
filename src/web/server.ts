/**
 * Web Server for MCP Kanban UI
 * Serves the browser-based interface and provides HTTP API endpoints for MCP tools
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getRegisteredTools, getTool } from '../index.js';
import { logger } from '../observability/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = process.env.WEB_PORT ? parseInt(process.env.WEB_PORT) : 3000;
const HOST = process.env.WEB_HOST || '127.0.0.1';

/**
 * Start the web server
 */
export async function startWebServer(): Promise<{ port: number; host: string }> {
  const server = createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);

      // Serve static HTML
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const distPath = path.join(__dirname, 'index.html');
        const srcPath = path.join(__dirname, '../../src/web/index.html');
        const html = await readFile(distPath).catch(async () => readFile(srcPath));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      // List all tools
      if (url.pathname === '/api/tools/list') {
        const tools = getRegisteredTools().map(({ name, originalName }) => ({
          name,
          originalName,
          available: typeof getTool(name) === 'function',
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tools }));
        return;
      }

      // Execute a tool
      if (url.pathname.startsWith('/api/tools/') && req.method === 'POST') {
        const toolName = url.pathname.replace('/api/tools/', '');
        const handler = getTool(toolName);

        if (!handler || typeof handler !== 'function') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: {
              code: 'TOOL_NOT_FOUND',
              message: `Tool '${toolName}' not found`
            }
          }));
          return;
        }

        // Read request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = Buffer.concat(chunks).toString();
        const params = body ? JSON.parse(body) : {};

        // Execute the tool
        try {
          const result = await (handler as (params: unknown) => Promise<unknown>)(params);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        } catch (error) {
          const errorObj = error as { code?: string; message: string };
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: {
              code: errorObj.code || 'EXECUTION_ERROR',
              message: errorObj.message || 'Unknown error'
            }
          }));
        }
        return;
      }

      // 404 for unknown routes
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');

    } catch (error) {
      logger.error({ err: error }, 'Web server error');
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  const chosenPort = await listenWithFallback(server, HOST, DEFAULT_PORT);
  // Log to stderr to avoid interfering with MCP stdio transport
  logger.info({ port: chosenPort, host: HOST }, `Web UI available at http://${HOST}:${chosenPort}`);

  return { port: chosenPort, host: HOST };
}

async function listenWithFallback(
  server: ReturnType<typeof createServer>,
  host: string,
  startPort: number,
): Promise<number> {
  let port = startPort;
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      return port;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'EADDRINUSE') {
        logger.warn({ port, host }, `Port ${port} in use, trying ${port + 1}`);
        port += 1;
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Could not bind web server after ${maxAttempts} attempts starting at port ${startPort}`);
}
