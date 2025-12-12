import { moveTask } from '../backlog/task-move.js';
import { wrapWithErrorHandling } from '../shared/errors.js';

interface MoveParams {
  task_id: string;
  version: number;
  to_status: string;
  force?: boolean;
  caller_id?: string;
}

export const tasksMove = {
  name: 'tasks_move',
  handler: async (params: MoveParams) =>
    wrapWithErrorHandling(() =>
      moveTask(
        {
          taskId: params.task_id,
          version: params.version,
          toStatus: params.to_status,
          force: params.force,
        },
        { callerId: params.caller_id },
      ),
    ),
};
