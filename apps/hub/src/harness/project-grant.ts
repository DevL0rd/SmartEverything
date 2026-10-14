import { z } from 'zod';
import {
  AI_HARNESS_STORAGE_BINDING,
  ApiError,
  type AiHarnessStorageBinding,
} from '@smarteverything/domain';
import { HARNESS_GRANT } from './grant';
import type { Store } from '../store/store';
const REQUEST = z.strictObject({
  kind: z.literal('project_storage_binding'),
  session_id: z.string(),
});
export function storedProjectBinding(
  store: Store,
  id: string,
): AiHarnessStorageBinding | undefined {
  const operation = store.harnessCoordination.operation(`project-binding:${id}`);
  if (operation === undefined) return undefined;
  const request = REQUEST.parse(JSON.parse(operation.request));
  if (
    operation.session_id !== id ||
    request.session_id !== id ||
    operation.state !== 'completed' ||
    operation.result === null
  )
    throw new ApiError('conflict', 'Central workspace binding has no completed durable metadata.');
  return AI_HARNESS_STORAGE_BINDING.parse(JSON.parse(operation.result));
}
export function issueProjectGrant(store: Store, input: z.input<typeof HARNESS_GRANT>): void {
  const grant = HARNESS_GRANT.parse(input);
  store.durableWrite(() => {
    if (grant.storage_binding !== undefined) {
      const key = `project-binding:${grant.session_id}`;
      store.harnessCoordination.begin(key, grant.session_id, {
        kind: 'project_storage_binding',
        session_id: grant.session_id,
      });
      store.harnessCoordination.finish(key, grant.storage_binding);
    }
    store.harnessCoordination.issue(grant);
  });
}
