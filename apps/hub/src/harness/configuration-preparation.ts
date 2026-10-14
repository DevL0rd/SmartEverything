import { randomUUID } from 'node:crypto';
import { ApiError, DSH_SESSION_ID } from '@smarteverything/domain';
import type { AiHarnessSession } from '@smarteverything/domain';
import type { HarnessService } from './service';

export async function prepareHostConfiguration(
  service: HarnessService,
  session: AiHarnessSession,
): Promise<void> {
  const host = service.directory.get(session.target).host;
  if (host.manifest?.configuration_prepare !== true) return;
  if (session.epoch === null)
    throw new ApiError('conflict', 'Configuration preparation requires a stable native epoch.');
  await service.directory.execute(session.target, randomUUID(), {
    kind: 'configuration_prepare',
    session_id: session.session_id,
    expected_epoch: session.epoch,
    protected_sessions: service.store.harnessCoordination
      .unsettledSessions()
      .map((id) => DSH_SESSION_ID.parse(id)),
  });
}
