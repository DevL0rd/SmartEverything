import { OUTREACH_STATES, type AiOutreachRow, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import type { AutomationAiSlot } from '../automation-ai';
import { DEVICE_REF, PERSON_REF } from '../world-v3/refs';
import { modeOf } from './action-mode';
import type { EffectHandlers, EffectRun } from './effect-run';
import { IntegrationError } from './integration-error';
import { admitRun, AutomationRunCancelledError } from './run-abort';
import { callTool, type ToolOrigin } from './tool';

export interface CallEffectPorts {
  readonly store: Store;
  readonly ai: AutomationAiSlot;
}

interface Author extends ToolOrigin {
  readonly profileId: string;
}

const ID = z.string().min(1);

const PERSON = z.union([ID, PERSON_REF]);

const DEVICE = z.union([ID, DEVICE_REF]);

const REASON = z.string().trim().min(1);

const PERSON_PARAMS = z.object({
  person: PERSON,
  device: z.enum(['phone', 'desktop', 'any']).default('any'),
  reason: REASON,
  urgent: z.boolean().default(false),
});

const OPEN_PARAMS = z.object({
  device: DEVICE.optional(),
  channel: ID.optional(),
  reason: REASON,
  urgent: z.boolean().default(false),
});

const END_PARAMS = z.object({ outreachId: ID });

const STARTED = z.object({ result: z.object({ id: ID, state: z.enum(OUTREACH_STATES) }) });

type Outcome = 'answered' | 'declined' | 'missed' | 'cancelled';

interface Resolution {
  readonly answered: boolean;
  readonly outcome: Outcome;
}

function authorOf(ports: CallEffectPorts, run: EffectRun): Author {
  const row = ports.store.automations.find(run.automationId);
  return {
    profileId: row?.author?.profile_id ?? ports.store.profiles.first().id,
    plugin: row?.origin ?? null,
  };
}

async function startCall(
  ports: CallEffectPorts,
  run: EffectRun,
  args: Readonly<Record<string, JsonValue>>,
): Promise<AiOutreachRow> {
  admitRun(run);
  const author = authorOf(ports, run);
  const response = await callTool(
    ports.ai.current().tools,
    { profileId: author.profileId, tool: 'call_start', args },
    author,
  );
  const started = STARTED.parse(response).result;
  const row = ports.store.aiOutreach.byId(started.id);
  if (row.state === 'failed') {
    throw new IntegrationError(
      'Unreachable',
      row.detail ?? 'The call could not be started.',
      'ring_failed',
    );
  }
  return row;
}

function settled(store: Store, first: AiOutreachRow, run: EffectRun): Promise<AiOutreachRow> {
  return new Promise((resolve, reject) => {
    function stop(): void {
      unsubscribe();
      run.signal.removeEventListener('abort', cancel);
    }
    function cancel(): void {
      stop();
      reject(new AutomationRunCancelledError(run.runId));
    }
    function consider(row: AiOutreachRow): void {
      if (row.state === 'ringing') return;
      stop();
      resolve(row);
    }
    const unsubscribe = store.feed.subscribe((change) => {
      if (change.table === 'ai_outreach' && change.record?.id === first.id) consider(change.record);
    });
    run.signal.addEventListener('abort', cancel, { once: true });
    if (run.signal.aborted) {
      cancel();
      return;
    }
    consider(store.aiOutreach.byId(first.id));
  });
}

function resolutionOf(row: AiOutreachRow): Resolution {
  switch (row.state) {
    case 'live':
      return { answered: true, outcome: 'answered' };
    case 'ended':
      return row.answered_at === null
        ? { answered: false, outcome: 'cancelled' }
        : { answered: true, outcome: 'answered' };
    case 'declined':
      return { answered: false, outcome: 'declined' };
    case 'missed':
      return { answered: false, outcome: 'missed' };
    case 'failed':
    case 'ringing':
    case 'sent':
      throw new IntegrationError('Unreachable', row.detail ?? 'The call failed.', 'call_failed');
  }
}

function personCall(ports: CallEffectPorts): EffectHandlers[string] {
  return async (params, request, run) => {
    const checked = parsed(PERSON_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      const row = await startCall(ports, run, {
        action: 'ring',
        personId: ask.person,
        device: ask.device,
        reason: ask.reason,
        urgent: ask.urgent,
      });
      if (modeOf(request) !== 'wait_for_result') {
        return { ok: true, value: outputs({ outreachId: row.id }) };
      }
      const result = resolutionOf(await settled(ports.store, row, run));
      return {
        ok: true,
        value: outputs({ outreachId: row.id, ...result, timedOut: result.outcome === 'missed' }),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function targetOf(ask: z.infer<typeof OPEN_PARAMS>): JsonValue | undefined {
  const { device, channel } = ask;
  if (device !== undefined && channel !== undefined) return undefined;
  if (device !== undefined) return { kind: 'device', deviceId: device };
  return channel === undefined ? undefined : { kind: 'channel', channelId: channel };
}

function openCall(ports: CallEffectPorts): EffectHandlers[string] {
  return async (params, _request, run) => {
    const checked = parsed(OPEN_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    const target = targetOf(ask);
    if (target === undefined) return invalid('Pick either one device or one Talk channel.');
    try {
      const row = await startCall(ports, run, {
        action: 'open',
        target,
        reason: ask.reason,
        urgent: ask.urgent,
      });
      return { ok: true, value: outputs({ outreachId: row.id }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function endCall(ports: CallEffectPorts): EffectHandlers[string] {
  return async (params, _request, run) => {
    const checked = parsed(END_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      admitRun(run);
      const author = authorOf(ports, run);
      await callTool(
        ports.ai.current().tools,
        {
          profileId: author.profileId,
          tool: 'call_end',
          args: { outreachId: checked.value.outreachId },
        },
        author,
      );
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function callEffects(ports: CallEffectPorts): EffectHandlers {
  return {
    'call.person': personCall(ports),
    'call.open': openCall(ports),
    'call.end': endCall(ports),
  };
}
