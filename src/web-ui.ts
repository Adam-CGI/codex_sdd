#!/usr/bin/env node
/**
 * Start the MCP Kanban Web UI
 * This runs the web server without the stdio transport
 */

import { startWebServer } from './web/server.js';
import { logger, initRateLimiter } from './observability/index.js';
import open from 'open';

async function main(): Promise<void> {
  initRateLimiter();
  
  logger.info('Starting MCP Kanban Web UI...');
  
  const { port, host } = await startWebServer();
  
  // Auto-open browser
  const url = `http://${host}:${port}`;
  
  setTimeout(async () => {
    try {
      await open(url);
      logger.info({ url }, 'Opened browser');
    } catch (error) {
      logger.warn({ error }, 'Could not auto-open browser');
    }
  }, 1000);
  
  // Keep the process running
  process.on('SIGINT', () => {
    logger.info('Shutting down...');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Fatal error');
  process.exit(1);
});
