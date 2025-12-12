/**
 * CLI logger utilities
 */

import chalk from 'chalk';

export const logger = {
  success: (message: string) => {
    console.log(chalk.green('✓'), message);
  },

  error: (message: string) => {
    console.error(chalk.red('✗'), message);
  },

  warning: (message: string) => {
    console.warn(chalk.yellow('⚠'), message);
  },

  info: (message: string) => {
    console.log(chalk.blue('ℹ'), message);
  },

  log: (message: string) => {
    console.log(message);
  },

  dim: (message: string) => {
    console.log(chalk.dim(message));
  },

  title: (message: string) => {
    console.log(chalk.bold.cyan(message));
  },

  section: (title: string) => {
    console.log();
    console.log(chalk.bold.underline(title));
  },
};
