import { getBoard } from './board-service.js';
import { wrapWithErrorHandling } from '../shared/errors.js';

interface GetBoardParams {
  status_filter?: string | string[];
  assignee?: string;
  spec_id?: string;
  page?: number;
  page_size?: number;
}

/**
 * MCP tool wrapper for retrieving the Kanban board.
 * Exposes the board-service with filter + pagination support.
 */
export const kanbanGetBoard = {
  name: 'kanban_get_board',
  handler: async (params: GetBoardParams = {}) =>
    wrapWithErrorHandling(() =>
      getBoard({
        status_filter: params.status_filter,
        assignee: params.assignee,
        spec_id: params.spec_id,
        page: params.page,
        page_size: params.page_size,
      }),
    ),
};
