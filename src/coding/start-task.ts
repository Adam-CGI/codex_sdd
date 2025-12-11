import { wrapWithErrorHandling } from '../shared/errors.js';
import { startTask } from './coding-service.js';

interface StartTaskParams {
  task_id: string;
}

export const codingStartTask = {
  name: 'coding.start_task',
  handler: async (params: StartTaskParams) =>
    wrapWithErrorHandling(() =>
      startTask(params.task_id, {}),
    ),
};
