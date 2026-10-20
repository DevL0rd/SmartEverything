import {
  ORALB_KEY,
  clockPayload,
  metadataSelect,
  modeSlotsPayload,
  pacerPayload,
  readSelect,
  ringColourPayload,
  type OralbConfigKey,
  type OralbPrefixRule,
} from '@smarteverything/ble';
import {
  ORALB_RING_NAMES,
  type BrushActionResult,
  type BrushStep,
  type OralbPrefixRuleName,
  type OralbProbe,
} from '@smarteverything/domain';
import { GateError } from './gate';
import { WRITE_PROBES } from './probes-state';
import { READ_KEYS } from './plan';
import type { OralbState } from './state';
import {
  configSteps,
  configWriteSteps,
  hasPrefix,
  headPayload,
  readStep,
  selectSteps,
} from './steps';

export type Outcome =
  | { readonly ok: true; readonly rule?: OralbPrefixRuleName }
  | { readonly ok: false; readonly reason: string };

interface ProbeEnv {
  readonly brush: OralbState;
  readonly nowMs: number;
  readonly send: (steps: readonly BrushStep[]) => Promise<BrushActionResult>;
}

interface Stage {
  readonly payload: Uint8Array;
  readonly verify: boolean;
}

interface WritePlan {
  readonly key: OralbConfigKey;
  readonly stages: readonly Stage[];
}

const MIN_RUNNING_ADVERTS = 3;

const ADVERT_FAILED =
  'No running adverts were heard while no phone was connected. Brush for a few seconds with the Oral-B app closed and run the test again.';

export const NEEDS_NO_LINK: ReadonlySet<OralbProbe> = new Set(['advert_log']);

function missing(what: string): GateError {
  return new GateError(`The brush has not reported its ${what} yet; wake it and try again.`);
}

function otherColour(current: Uint8Array): Uint8Array {
  const candidates = ORALB_RING_NAMES.map((name) => ringColourPayload(name));
  return (
    candidates.find((payload) => payload.join() !== current.join()) ?? candidates[0] ?? current
  );
}

function ringPlan(brush: OralbState): WritePlan {
  if (brush.ringDrive === null) {
    throw missing('ring colour');
  }
  const current = Uint8Array.from(brush.ringDrive);
  return {
    key: ORALB_KEY.ringColour,
    stages: [current, otherColour(current), current].map((payload) => ({ payload, verify: true })),
  };
}

type WriteProbe = Exclude<
  OralbProbe,
  'advert_log' | 'connect_dump' | 'history_select' | 'metadata_select'
>;

function writePlan(probe: WriteProbe, env: ProbeEnv): WritePlan {
  const { brush } = env;
  switch (probe) {
    case 'pacer_write':
      if (brush.pacer === null) {
        throw missing('pacer');
      }
      return {
        key: ORALB_KEY.pacer,
        stages: [{ payload: pacerPayload(brush.pacer), verify: true }],
      };
    case 'mode_order_write':
      if (brush.modeSlots === null) {
        throw missing('mode order');
      }
      return {
        key: ORALB_KEY.modeSlots,
        stages: [{ payload: modeSlotsPayload(brush.modeSlots), verify: true }],
      };
    case 'head_reset_write':
      if (brush.headReading === null) {
        throw missing('head reminder');
      }
      return {
        key: ORALB_KEY.head,
        stages: [
          {
            payload: headPayload(
              brush.headReading.state,
              brush.headReading.days,
              brush.headReading.seconds,
            ),
            verify: true,
          },
        ],
      };
    case 'clock_write':
      return clockPlan(env);
    case 'ring_write':
      return ringPlan(brush);
  }
}

function clockPlan(env: ProbeEnv): WritePlan {
  const { clock, clockAtMs } = env.brush;
  if (clock === null || clockAtMs === null) {
    throw missing('clock');
  }
  const now = clock + Math.round((env.nowMs - clockAtMs) / 1000);
  return { key: ORALB_KEY.clock, stages: [{ payload: clockPayload(now), verify: false }] };
}

async function attempt(
  env: ProbeEnv,
  plan: WritePlan,
  rule: OralbPrefixRule,
): Promise<BrushActionResult> {
  let last: BrushActionResult = { ok: true, detail: '' };
  for (const stage of plan.stages) {
    const steps = stage.verify
      ? configSteps(rule, plan.key, stage.payload)
      : configWriteSteps(rule, plan.key, stage.payload);
    last = await env.send(steps);
    if (!last.ok) {
      return last;
    }
  }
  return last;
}

async function writeProbe(probe: WriteProbe, env: ProbeEnv): Promise<Outcome> {
  const plan = writePlan(probe, env);
  const rules: readonly OralbPrefixRuleName[] = hasPrefix(plan.key)
    ? ['prefixed', 'plain']
    : ['plain'];
  let reason = 'The brush refused the write.';
  for (const rule of rules) {
    const result = await attempt(env, plan, rule);
    if (result.ok) {
      return { ok: true, rule };
    }
    reason = result.detail;
  }
  return { ok: false, reason };
}

async function readOutcome(env: ProbeEnv, steps: readonly BrushStep[]): Promise<Outcome> {
  const result = await env.send(steps);
  return result.ok ? { ok: true } : { ok: false, reason: result.detail };
}

type ReadProbe = Exclude<OralbProbe, WriteProbe>;

const READ_RUNNERS: Readonly<Record<ReadProbe, (env: ProbeEnv) => Promise<Outcome>>> = {
  advert_log: (env) =>
    Promise.resolve(
      env.brush.runningAdverts >= MIN_RUNNING_ADVERTS
        ? { ok: true }
        : { ok: false, reason: ADVERT_FAILED },
    ),
  connect_dump: (env) => readOutcome(env, READ_KEYS.map(readStep)),
  history_select: (env) => readOutcome(env, selectSteps(readSelect(1))),
  metadata_select: (env) => readOutcome(env, selectSteps(metadataSelect(255))),
};

function isWriteProbe(probe: OralbProbe): probe is WriteProbe {
  return WRITE_PROBES.includes(probe);
}

export function runProbe(probe: OralbProbe, env: ProbeEnv): Promise<Outcome> {
  return isWriteProbe(probe) ? writeProbe(probe, env) : READ_RUNNERS[probe](env);
}
