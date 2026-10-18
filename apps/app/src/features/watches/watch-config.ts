import { useMutation } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { WATCH_CONFIG, type WatchActionRequest, type WatchConfig } from '@smarteverything/domain';
import { runWatchAction } from '../../api/watches';
import { notify } from '../../components/toast-store';
import { errorText } from '../../format/errors';
import type { Device } from '../../store/state';

const log = new Logger('app.watch');

export type ConfigState =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'ready'; readonly config: WatchConfig };

export function configOf(watch: Device): ConfigState {
  const raw = watch.details['config'];
  if (raw === undefined || raw === null) {
    return { kind: 'none' };
  }
  const parsed = WATCH_CONFIG.safeParse(raw);
  if (!parsed.success) {
    log.warn('watch.config_invalid', {
      deviceId: watch.id,
      issues: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
  }
  return parsed.success
    ? { kind: 'ready', config: parsed.data }
    : { kind: 'invalid', reason: parsed.error.issues.map((issue) => issue.message).join('; ') };
}

export interface WatchOutcome {
  readonly ok: boolean;
  readonly detail: string;
}

export interface WatchCommand {
  readonly busy: boolean;
  readonly outcome: WatchOutcome | null;
  readonly run: (...actions: readonly WatchActionRequest[]) => void;
}

export class WatchActionError extends Error {
  override readonly name = 'WatchActionError';
}

export async function runInOrder(
  deviceId: string,
  actions: readonly WatchActionRequest[],
): Promise<WatchOutcome> {
  let last: WatchOutcome = { ok: true, detail: '' };
  for (const action of actions) {
    const startedAt = Date.now();
    log.debug('watch.action_sending', { deviceId, action: action.type });
    last = await runWatchAction(deviceId, action);
    log.info('watch.action_result', {
      deviceId,
      action: action.type,
      ok: last.ok,
      detail: last.detail,
      latencyMs: Date.now() - startedAt,
    });
    if (!last.ok) {
      throw new WatchActionError(last.detail);
    }
  }
  return last;
}

export function outcomeOf(
  error: Error | null,
  data: WatchOutcome | undefined,
): WatchOutcome | null {
  if (error !== null) {
    const text = errorText(error);
    return { ok: false, detail: text.detail === '' ? text.title : text.detail };
  }
  return data ?? null;
}

export function useWatchCommand(watch: Pick<Device, 'id'>): WatchCommand {
  const mutation = useMutation({
    mutationFn: (actions: readonly WatchActionRequest[]) => runInOrder(watch.id, actions),
    onSuccess: (): void => {
      notify({ message: 'Sent to the watch', tone: 'positive' });
    },
    onError: (error): void => {
      log.error('watch.action_failed', error, { deviceId: watch.id });
    },
  });
  return {
    busy: mutation.isPending,
    outcome: outcomeOf(mutation.error, mutation.data),
    run: (...actions): void => {
      mutation.mutate(actions);
    },
  };
}
