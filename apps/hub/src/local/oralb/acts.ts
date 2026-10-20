import {
  ApiError,
  ORALB_MODE_IDS,
  type BrushAction,
  type BrushActionResult,
  type BrushStep,
  type OralbProbe,
} from '@smarteverything/domain';
import {
  ORALB_KEY,
  headResetPayload,
  headSnoozePayload,
  modeSlotsPayload,
} from '@smarteverything/ble';
import type { ActContext } from '../toothbrush/brand';
import type { DeviceState } from '../toothbrush/fleet';
import { ownerOnly } from '../toothbrush/view-deps';
import { identityOf, withOralb } from './config';
import { GateError, assertIdleAndLinked, assertWritable } from './gate';
import type { ProbeResult } from './probes-state';
import { NEEDS_NO_LINK, runProbe, type Outcome } from './probes';
import { OralbRuntime } from './runtime';
import { configWriteSteps, readStep } from './steps';

type Brand = Extract<
  BrushAction,
  { action: 'set_mode_order' | 'reset_head_reminder' | 'snooze_head_reminder' | 'probe' }
>;

function runtimeOf(state: DeviceState): OralbRuntime {
  const { brand } = state.runtime;
  if (!(brand instanceof OralbRuntime)) {
    throw new ApiError('internal', 'This device is not an Oral-B toothbrush.');
  }
  return brand;
}

function sender(context: ActContext): (steps: readonly BrushStep[]) => Promise<BrushActionResult> {
  const { deps, device } = context;
  const holder = deps.holderOf(device);
  const name = device.display_name ?? device.name;
  return (steps) => {
    if (holder === null) {
      throw new GateError(
        `${name} is not linked to a phone. Open SmartEverything on a phone near the toothbrush and wake the brush first.`,
      );
    }
    return deps.broker.run({ clientId: holder, deviceId: device.id, name }, steps);
  };
}

async function setModeOrder(
  context: ActContext,
  state: DeviceState,
  modes: Extract<Brand, { action: 'set_mode_order' }>['modes'],
): Promise<BrushActionResult> {
  const rule = assertWritable(state, 'mode_order_write');
  const ids = modes.map((mode) => ORALB_MODE_IDS[mode]);
  if (new Set(ids).size !== ids.length) {
    throw new ApiError('invalid_request', 'Each mode can appear once in the mode order.');
  }
  return sender(context)([
    ...configWriteSteps(rule, ORALB_KEY.modeSlots, modeSlotsPayload(ids)),
    readStep(ORALB_KEY.modeSlots),
  ]);
}

async function setHeadReminder(
  context: ActContext,
  state: DeviceState,
  payload: Uint8Array,
): Promise<BrushActionResult> {
  const rule = assertWritable(state, 'head_reset_write');
  const send = sender(context);
  const written = await send(configWriteSteps(rule, ORALB_KEY.head, payload));
  return written.ok ? send([readStep(ORALB_KEY.head)]) : written;
}

function stamp(outcome: Outcome, firmware: number, at: Date): ProbeResult {
  const moment = at.toISOString();
  if (!outcome.ok) {
    return { failedAt: moment, firmware, reason: outcome.reason };
  }
  return outcome.rule === undefined
    ? { passedAt: moment, firmware }
    : { passedAt: moment, firmware, rule: outcome.rule };
}

async function probe(
  context: ActContext,
  state: DeviceState,
  id: OralbProbe,
): Promise<BrushActionResult> {
  const { deps, device } = context;
  if (!NEEDS_NO_LINK.has(id)) {
    assertIdleAndLinked(state);
  }
  const outcome = await runProbe(id, {
    brush: runtimeOf(state).snapshot,
    nowMs: deps.now().getTime(),
    send: sender(context),
  });
  const result = stamp(outcome, identityOf(state.entry).firmware, deps.now());
  const live = id === 'advert_log' && !outcome.ok;
  const { entry } = state;
  deps.store.localDevices.updateConfig(
    entry.externalId,
    withOralb(entry.config, (block) => ({
      ...block,
      live: live ? 'connected' : block.live,
      probes: { ...block.probes, [id]: result },
    })),
  );
  state.useEntry(deps.store.localDevices.byExternalId(entry.externalId));
  await deps.local.observe(device.external_id, {});
  return outcome.ok
    ? { ok: true, detail: `The handle test passed (${id}).` }
    : { ok: false, detail: outcome.reason };
}

async function dispatch(
  action: Brand,
  context: ActContext,
  state: DeviceState,
): Promise<BrushActionResult> {
  switch (action.action) {
    case 'probe':
      return probe(context, state, action.probe);
    case 'set_mode_order':
      return setModeOrder(context, state, action.modes);
    case 'reset_head_reminder':
      return setHeadReminder(context, state, headResetPayload());
    case 'snooze_head_reminder':
      return setHeadReminder(context, state, headSnoozePayload());
  }
}

export async function oralbAct(
  action: BrushAction,
  context: ActContext,
): Promise<BrushActionResult> {
  if (
    action.action !== 'probe' &&
    action.action !== 'set_mode_order' &&
    action.action !== 'reset_head_reminder' &&
    action.action !== 'snooze_head_reminder'
  ) {
    throw new ApiError('invalid_request', 'This action is not an Oral-B action.');
  }
  ownerOnly(context.actor, 'change the toothbrush handle');
  try {
    return await dispatch(action, context, context.deps.fleet.of(context.device));
  } catch (cause) {
    if (cause instanceof GateError) {
      throw new ApiError('invalid_request', cause.message);
    }
    throw cause;
  }
}
