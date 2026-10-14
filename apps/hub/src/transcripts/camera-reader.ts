import { ApiError } from '@smarteverything/domain';
import { validateExecutionAuthority } from '../assistant/execution-authority';
import { profileIdOf, type Caller } from '../server/auth';
import type { Store } from '../store/store';
import type { TranscriptScope } from '../store/repositories/transcript-reader';

export function cameraReaderScope(
  store: Store,
  caller: Caller,
  cameraId?: string,
): TranscriptScope {
  if (caller.kind !== 'client' && caller.kind !== 'service')
    throw new ApiError('forbidden', 'A paired camera viewer or issued service grant is required.');
  if (caller.authority !== undefined) validateExecutionAuthority(store, caller.authority);
  const cameras = store.cameras.list().map((camera) => camera.device_id);
  if (cameraId !== undefined && !cameras.includes(cameraId))
    throw new ApiError('not_found', 'The requested camera is unavailable.');
  const principal = caller.kind === 'client' ? caller.client.id : caller.authority.event_id;
  const actor = JSON.stringify({
    principal,
    profile: profileIdOf(store, caller),
    plugin: caller.pluginId,
    requester: caller.pluginRequester,
    origin: caller.kind === 'client' ? caller.mcpOrigin : 'service',
  });
  return { kind: 'camera', cameraIds: cameraId === undefined ? cameras : [cameraId], actor };
}
