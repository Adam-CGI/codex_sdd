import { updateTask } from '../backlog/task-update.js';
import { wrapWithErrorHandling } from '../shared/errors.js';

interface UpdateParams {
  task_id: string;
  version: number;
  meta?: Record<string, unknown>;
  sections?: Record<string, string>;
}

export const tasksUpdate = {
  name: 'tasks.update',
  handler: async (params: UpdateParams) =>
    wrapWithErrorHandling(() =>
      updateTask(
        {
          taskId: params.task_id,
          version: params.version,
          meta: params.meta as any,
          sections: params.sections,
        },
        {},
      ),
    ),
};
