import { updateTask } from '../backlog/task-update.js';
import type { TaskMeta } from '../backlog/task-store.js';
import { wrapWithErrorHandling } from '../shared/errors.js';

interface UpdateParams {
  task_id: string;
  version: number;
  meta?: Partial<TaskMeta>;
  sections?: Record<string, string>;
  caller_id?: string;
}

export const tasksUpdate = {
  name: 'tasks_update',
  handler: async (params: UpdateParams) =>
    wrapWithErrorHandling(() =>
      updateTask(
        {
          taskId: params.task_id,
          version: params.version,
          meta: params.meta,
          sections: params.sections,
        },
        { callerId: params.caller_id },
      ),
    ),
};
