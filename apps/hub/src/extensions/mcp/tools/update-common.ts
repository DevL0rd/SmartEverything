import type { HubLayout } from '../../../data-layout';
import { UpdateBusyError, UpdateUnavailableError } from '../../../self-update/command';
import { httpsPublicServer } from '../../../self-update/public-server';
import { ToolError, type ToolContext } from './registry';
import { requireUpdateRequester } from './update-requester';

export type KeysContext = Pick<ToolContext, 'store' | 'caller' | 'actor' | 'layout' | 'clock'>;

export function layoutOf(context: Omit<KeysContext, 'clock'>): HubLayout {
  requireUpdateRequester(context);
  return context.layout;
}

export function updateError(cause: unknown): never {
  if (cause instanceof UpdateUnavailableError) throw new ToolError(cause.message, 'unavailable');
  if (cause instanceof UpdateBusyError) throw new ToolError(cause.message, 'busy');
  throw cause;
}

export function publicServer(context: ToolContext): string {
  return httpsPublicServer(context.store.settings.read());
}
