import type { HarnessRuntimeRequest } from '@smarteverything/domain';
import type { HarnessSession } from '../host/session';
import type { HarnessRuntimeOptions } from '../host/runtime';
import type { HarnessOpenRequest } from './streams';
import type { ProcessProjection } from './projection';
import { HarnessRuntimeError } from '../host/errors';

export async function updatePermission(
  session: HarnessSession,
  request: Extract<HarnessRuntimeRequest, { kind: 'permission' }>,
  operationId: string,
  ports: {
    readonly host: HarnessRuntimeOptions['host'];
    readonly opened: Map<string, HarnessOpenRequest>;
    readonly projection: ProcessProjection;
  },
): Promise<void> {
  if (request.operation_id !== operationId)
    throw new HarnessRuntimeError(
      'operation_failed',
      'Permission operation identity differs from its control.',
    );
  const binding = ports.opened.get(session.id);
  if (binding === undefined)
    throw new HarnessRuntimeError('ownership_lost', 'Permission update has no native binding.');
  await session.permission(request.permission);
  ports.opened.set(session.id, { ...binding, permission: request.permission });
  await ports.projection.permission(session.id, operationId, request.permission);
}
