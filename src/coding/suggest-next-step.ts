import { wrapWithErrorHandling } from '../shared/errors.js';
import { suggestNextStep } from './coding-service.js';

interface SuggestNextStepParams {
  task_id: string;
  current_diff_context?: string;
  caller_id?: string;
}

export const codingSuggestNextStep = {
  name: 'coding.suggest_next_step',
  handler: async (params: SuggestNextStepParams) =>
    wrapWithErrorHandling(() =>
      suggestNextStep(params.task_id, params.current_diff_context, { callerId: params.caller_id }),
    ),
};
