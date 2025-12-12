/**
 * Stub commands - to be implemented
 */

import { logger } from '../utils/logger.js';

export async function boardExportCommand(_file?: string, _options?: unknown) {
  logger.warning('Board export command not yet implemented');
}

export async function searchCommand(_query: string, _options: unknown) {
  logger.warning('Search command not yet implemented');
  logger.info('Use tasks_search MCP tool for now');
}

export async function specCreateCommand(_title: string, _options: unknown) {
  logger.warning('Spec create command not yet implemented');
  logger.info('Use planning_create_spec MCP tool');
}

export async function specListCommand() {
  logger.warning('Spec list command not yet implemented');
}

export async function specViewCommand(_id: string) {
  logger.warning('Spec view command not yet implemented');
}

export async function specBreakdownCommand(_id: string) {
  logger.warning('Spec breakdown command not yet implemented');
  logger.info('Use planning_breakdown_spec MCP tool');
}

export async function mcpCommand(_options: unknown) {
  logger.warning('MCP command not yet implemented');
  logger.info('Use "pnpm mcp" to start the MCP server');
}

export async function configListCommand() {
  logger.warning('Config list command not yet implemented');
}

export async function configGetCommand(_key: string) {
  logger.warning('Config get command not yet implemented');
}

export async function configSetCommand(_key: string, _value: string) {
  logger.warning('Config set command not yet implemented');
}

export async function configWizardCommand() {
  logger.warning('Config wizard not yet implemented');
}

export async function overviewCommand() {
  logger.warning('Overview command not yet implemented');
}
