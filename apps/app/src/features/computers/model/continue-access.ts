import type { ComputerAiStatus } from '@smarteverything/domain';
import type { ContinueAccess } from '../components/native-session';

export function canStart(status: ComputerAiStatus | undefined, owner: boolean): boolean {
  return (
    owner &&
    status?.online === true &&
    status.settings.provider.enabled &&
    status.capabilities.provider_reason === null
  );
}

export function startReason(status: ComputerAiStatus | undefined, owner: boolean): string {
  if (!owner) return 'Only the home owner can use Claude on this computer.';
  if (status?.online === false) return 'This computer is offline. Saved chats stay readable.';
  return (
    status?.capabilities.provider_reason ??
    'Turn on Claude on this computer to start a session. Saved chats stay readable.'
  );
}

export function continueAccess(
  status: ComputerAiStatus | undefined,
  owner: boolean,
): ContinueAccess {
  return status !== undefined && canStart(status, owner)
    ? { status }
    : { reason: startReason(status, owner) };
}
