import { wrapWithErrorHandling } from '../shared/errors.js';
import { updateTaskStatus } from './coding-service.js';

interface UpdateTaskStatusParams {
  task_id: string;
  version: number;
  status: string;
  notes?: string;
  caller_id?: string;
}

export const codingUpdateTaskStatus = {
  name: 'coding_update_task_status',
  handler: async (params: UpdateTaskStatusParams) =>
    wrapWithErrorHandling(() =>
      updateTaskStatus(
        {
          taskId: params.task_id,
          version: params.version,
          status: params.status,
          notes: params.notes,
        },
        { callerId: params.caller_id },
      ),
    ),
};
