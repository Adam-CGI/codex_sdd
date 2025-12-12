/**
 * Browser command - launches the web UI
 */

import { logger } from '../utils/logger.js';
import { requireProjectRoot } from '../utils/find-root.js';
import { spawn } from 'child_process';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';

interface BrowserOptions {
  port: string;
  open: boolean;
}

export async function browserCommand(options: BrowserOptions) {
  const root = requireProjectRoot();
  const port = options.port || '6420';

  logger.title('🌐 Launching SDD Web Interface');
  console.log();
  logger.info(`Port: ${port}`);
  logger.info(`Auto-open: ${options.open ? 'Yes' : 'No'}`);
  console.log();

  const spinner = ora('Starting web server...').start();

  try {
    // Set environment variables for the web UI
    const env = {
      ...process.env,
      PORT: port,
      AUTO_OPEN: options.open ? 'true' : 'false',
      PROJECT_ROOT: root,
    };

    // Path to web-ui.ts
    const webUiPath = join(__dirname, '../../web-ui.js');

    // Start the web UI using tsx for development or node for production
    const command = process.env.NODE_ENV === 'production' ? 'node' : 'npx';
    const args = process.env.NODE_ENV === 'production' 
      ? [webUiPath]
      : ['tsx', join(__dirname, '../../web-ui.ts')];

    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: 'inherit',
    });

    spinner.succeed('Web server started');
    console.log();
    logger.success(`Web interface available at ${chalk.cyan(`http://localhost:${port}`)}`);
    console.log();
    logger.dim('Press Ctrl+C to stop the server');
    console.log();

    // Handle process termination
    process.on('SIGINT', () => {
      logger.info('Shutting down web server...');
      child.kill();
      process.exit(0);
    });

    // Wait for child process
    child.on('exit', (code) => {
      if (code !== 0) {
        logger.error(`Web server exited with code ${code}`);
        process.exit(code || 1);
      }
    });

  } catch (error) {
    spinner.fail('Failed to start web server');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
