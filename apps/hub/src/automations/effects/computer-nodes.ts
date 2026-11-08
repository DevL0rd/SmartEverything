import {
  ApiError,
  AUDIO_CHANGE,
  DISPLAY_CHANGE,
  DISPLAY_STATE,
  type AudioChange,
  type DisplayChange,
  type DisplayState,
  type NodeRequest,
} from '@smarteverything/domain';
import type { Outputs } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { AutomationComputersSlot } from '../automation-computers';
import { effectFailure } from '../effect-failure';
import { outputs, parsed } from '../engine-v3-effects';
import { AUDIO_PARAMS, DISPLAY_PARAMS } from '../integration-params';
import { ComputerEffects, runViewer } from './computer';
import { mergedChange, same, type Fields } from './computer-change';
import { computerControlEffects } from './computer-control-nodes';
import { computerSystemEffects, type ComputerSystemPorts } from './computer-system-nodes';
import type { EffectHandlers, EffectRun } from './effect-run';
import { awaitRun } from './run-abort';

export type ComputerNodePorts = ComputerSystemPorts;

export const AUDIO_FIELDS: Fields = {
  volume: same('kind', 'device', 'level'),
  mute: same('kind', 'device', 'muted'),
  default: same('kind', 'device'),
  app_volume: same('app', 'level'),
  app_mute: same('app', 'muted'),
  app_output: same('app', 'output'),
};

export const DISPLAY_FIELDS: Fields = {
  enable: same('output'),
  disable: same('output'),
  mode: same('output', 'width', 'height', 'refreshHz'),
  scale: [
    ['output', 'output'],
    ['percent', 'scale'],
  ],
  rotation: [
    ['output', 'output'],
    ['degrees', 'rotation'],
  ],
  primary: same('output'),
  position: same('output', 'relativeTo', 'side'),
  mirror: [
    ['output', 'output'],
    ['of', 'mirrorOf'],
  ],
  brightness: [
    ['output', 'output'],
    ['level', 'brightness'],
  ],
  hdr: same('output', 'enabled'),
  vrr: [
    ['output', 'output'],
    ['policy', 'vrr'],
  ],
  night_light: [
    ['mode', 'nightLight'],
    ['temperatureKelvin', 'temperature'],
  ],
  keep: [],
  revert: [],
};

const NEEDS_SCREEN: ReadonlySet<string> = new Set([
  'enable',
  'disable',
  'mode',
  'scale',
  'rotation',
  'primary',
  'position',
  'mirror',
  'hdr',
  'vrr',
]);

const NO_PENDING_CHANGE = 'No screen change is waiting to be kept.';

function audioChange(params: z.infer<typeof AUDIO_PARAMS>): AudioChange {
  const raw = mergedChange(AUDIO_FIELDS, params);
  const checked = AUDIO_CHANGE.safeParse(raw);
  if (!checked.success) throw new ApiError('invalid_request', z.prettifyError(checked.error));
  return checked.data;
}

async function screenOf(
  computers: AutomationComputersSlot,
  computer: string,
  run: EffectRun,
): Promise<string> {
  const state = await awaitRun(
    computers.current().ask(runViewer(), computer, { verb: 'displays' }, DISPLAY_STATE),
    run,
  );
  const [only, second] = state.outputs;
  if (only !== undefined && second === undefined) return only.id;
  const listed = state.outputs.map((screen) => `${screen.name} (${screen.id})`).join(', ');
  throw new ApiError('invalid_request', `Choose which screen to change: ${listed}.`);
}

async function displayChange(
  computers: AutomationComputersSlot,
  params: z.infer<typeof DISPLAY_PARAMS>,
  run: EffectRun,
): Promise<DisplayChange> {
  const raw = mergedChange(DISPLAY_FIELDS, params);
  const action = raw['action'];
  const pending =
    typeof action === 'string' && NEEDS_SCREEN.has(action) && raw['output'] === undefined;
  const output = pending ? { output: await screenOf(computers, params.computer, run) } : {};
  const mirrorEnds = action === 'mirror' && raw['of'] === undefined ? { of: null } : {};
  const checked = DISPLAY_CHANGE.safeParse({ ...raw, ...output, ...mirrorEnds });
  if (!checked.success) throw new ApiError('invalid_request', z.prettifyError(checked.error));
  return checked.data;
}

async function decide(
  computers: AutomationComputersSlot,
  computer: string,
  keep: boolean,
  run: EffectRun,
): Promise<void> {
  const ask = (request: NodeRequest): Promise<DisplayState> =>
    awaitRun(computers.current().ask(runViewer(), computer, request, DISPLAY_STATE), run);
  const shown = await ask({ verb: 'displays' });
  if (shown.pendingRevert === null) throw new ApiError('conflict', NO_PENDING_CHANGE);
  await ask({ verb: 'display_confirm', token: shown.pendingRevert.token, keep });
}

function audioNode(ports: ComputerNodePorts): EffectHandlers[string] {
  const effects = new ComputerEffects(ports.computers);
  return async (params: Outputs, _request, run) => {
    const checked = parsed(AUDIO_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      const change = audioChange(checked.value);
      await effects.audio({ computer: checked.value.computer, change }, run);
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function displayNode(ports: ComputerNodePorts): EffectHandlers[string] {
  const effects = new ComputerEffects(ports.computers);
  return async (params: Outputs, _request, run) => {
    const checked = parsed(DISPLAY_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      if (ask.action === 'keep' || ask.action === 'revert') {
        await decide(ports.computers, ask.computer, ask.action === 'keep', run);
      } else {
        const change = await displayChange(ports.computers, ask, run);
        await effects.display({ computer: ask.computer, change, keep: ask.keep }, run);
      }
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function computerNodeEffects(ports: ComputerNodePorts): EffectHandlers {
  return {
    'computer.audio': audioNode(ports),
    'computer.display': displayNode(ports),
    ...computerSystemEffects(ports),
    ...computerControlEffects(ports),
  };
}
