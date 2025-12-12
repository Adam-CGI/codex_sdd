import { getTaskById } from '../backlog/task-store.js';
import { wrapWithErrorHandling } from '../shared/errors.js';

interface GetTaskParams {
  task_id: string;
  caller_id?: string;
}

export const tasksGet = {
  name: 'tasks_get',
  handler: async (params: GetTaskParams) =>
    wrapWithErrorHandling(() =>
      getTaskById(params.task_id, { baseDir: process.cwd() }),
    ),
};
