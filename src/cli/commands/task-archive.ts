/**
 * Task archive command
 */

import { logger } from '../utils/logger.js';

export async function taskArchiveCommand(_id: string) {
  logger.warning('Task archive command not yet implemented');
  logger.info('Use the MCP tool tasks_move to move to Done status');
}
