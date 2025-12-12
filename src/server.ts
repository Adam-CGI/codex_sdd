import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import pkg from '../package.json' with { type: 'json' };
import { getRegisteredTools, getTool } from './index.js';
import { logger, initRateLimiter } from './observability/index.js';
import { startWebServer } from './web/server.js';

async function main(): Promise<void> {
  initRateLimiter();

  const server = new McpServer({
    name: pkg.name ?? 'mcp-kanban-server',
    version: pkg.version ?? '0.0.0',
  });

  for (const { name: toolName, originalName } of getRegisteredTools()) {
    const handler = getTool(toolName);

    // Skip placeholders that don't have implementations yet
    if (typeof handler !== 'function') continue;

    // Allow arbitrary params by default so clients can send snake_case fields without validation errors.
    const permissiveParams = z.object({}).passthrough();

    server.registerTool(
      toolName,
      {
        title: originalName,
        inputSchema: permissiveParams,
      },
      async (args: unknown) => {
        const result = await (handler as (params: unknown) => Promise<unknown>)(args ?? {});
        return {
          content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
      },
    );
  }

  // Start web server only when allowed. In stdio-only mode the MCP client expects
  // clean stdout, so we skip the web UI to avoid extra output. If the web server
  // cannot bind (e.g., ports in use), we log a warning but still continue with
  // the MCP stdio server so clients can connect.
  const stdioOnly = process.env.STDIO_ONLY === 'true';
  if (!stdioOnly) {
    try {
      await startWebServer();
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'Web server failed to start; continuing without UI'
      );
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(
    { tools: getRegisteredTools().length },
    'MCP stdio server ready (stdin/stdout transport)',
  );
}

main().catch((error) => {
  logger.error({ err: error }, 'MCP server failed to start');
  process.exit(1);
});
