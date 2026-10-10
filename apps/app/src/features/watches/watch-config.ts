import { useState } from 'react';
import { Logger } from '@smarteverything/logging';
import { WATCH_CONFIG, type WatchActionRequest, type WatchConfig } from '@smarteverything/domain';
import { runWatchAction } from '../../api/watches';
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
  return parsed.success
    ? { kind: 'ready', config: parsed.data }
    : { kind: 'invalid', reason: parsed.error.issues.map((issue) => issue.message).join('; ') };
}

export interface WatchCommand {
  readonly busy: boolean;
  readonly outcome: { readonly ok: boolean; readonly detail: string } | null;
  readonly run: (...actions: readonly WatchActionRequest[]) => void;
}

async function runInOrder(
  deviceId: string,
  actions: readonly WatchActionRequest[],
): Promise<{ readonly ok: boolean; readonly detail: string }> {
  let last = { ok: true, detail: '' };
  for (const action of actions) {
    last = await runWatchAction(deviceId, action);
    log.info('watch.action_result', { action: action.type, ok: last.ok, detail: last.detail });
    if (!last.ok) {
      return last;
    }
  }
  return last;
}

export function useWatchCommand(watch: Device): WatchCommand {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<WatchCommand['outcome']>(null);
  const run = (...actions: readonly WatchActionRequest[]): void => {
    setBusy(true);
    runInOrder(watch.id, actions).then(
      (result) => {
        setBusy(false);
        setOutcome(result);
      },
      (error: unknown) => {
        const text = errorText(error);
        setBusy(false);
        setOutcome({ ok: false, detail: text.detail === '' ? text.title : text.detail });
      },
    );
  };
  return { busy, outcome, run };
}
