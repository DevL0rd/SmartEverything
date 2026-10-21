import {
  AUDIO_CHANGE,
  AUDIO_STATE,
  DISPLAY_CHANGE,
  DISPLAY_STATE,
  DISPLAY_TOOL_ACTIONS,
  SERVICES_STATE,
  STARTUP_STATE,
  SYSTEM_STATE,
  SYSTEM_TOOL_CHANGE,
  WINDOWS_STATE,
  type AudioChange,
  type DisplayChange,
  type EndpointName,
  type McpPartName,
  type SystemToolChange,
  type WindowAction,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate, type OperatingContext } from './acting';
import { audioSummary, displaySummary, revertNote, systemSummary } from './computer-changes';
import {
  compactAudio,
  compactDisplays,
  compactServices,
  compactStartup,
  compactSystem,
  compactWindows,
} from './computer-compact';
import { actionOf, flatChange, type Chosen } from './computer-flat';
import { COMPUTER_ID, computerIdOf } from './computer-target';
import { ToolError, WRITES, defineTool, issuesOf, type Tool } from './registry';

type Fields = Record<string, unknown>;

function answered(summary: string, state: Fields): Fields {
  return { ok: true, summary, state };
}

function changed(
  context: OperatingContext,
  name: EndpointName,
  deviceId: string,
  body: unknown,
): Promise<unknown> {
  return operate(context, name, { params: { deviceId }, body });
}

const KEEP = z.strictObject({ action: z.literal('keep') });

const REVERT = z.strictObject({ action: z.literal('revert') });

const DISPLAY_TOOL_NAMES: ReadonlySet<string> = new Set(DISPLAY_TOOL_ACTIONS);

const SCREEN = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe('A screen id or name from computer_read view displays; the only screen when left out');

const RESOLUTION = z
  .string()
  .regex(/^\d+x\d+$/u, 'use WIDTHxHEIGHT, such as 2560x1440')
  .describe('Resolution as WIDTHxHEIGHT, such as 2560x1440, one the screen lists in its modes');

const PERCENT = z
  .number()
  .min(0)
  .max(400)
  .describe('Percent: the scale for action scale (50 to 400, 100 is normal) or the brightness for action brightness (0 to 100)');

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

function displayOption(option: z.ZodObject): z.ZodObject {
  const action = actionOf(option);
  if (action === 'mode') {
    return z.strictObject({
      action: z.literal('mode'),
      output: SCREEN,
      resolution: RESOLUTION,
      refreshHz: option.shape['refreshHz'] ?? z.never(),
    });
  }
  if (action === 'brightness') {
    return z.strictObject({ action: z.literal('brightness'), percent: PERCENT, output: SCREEN });
  }
  if (action === 'scale') {
    return z.strictObject({ action: z.literal('scale'), output: SCREEN, percent: PERCENT });
  }
  return NEEDS_SCREEN.has(action) ? option.extend({ output: SCREEN }) : option;
}

const DISPLAY_OPTIONS: readonly z.ZodObject[] = [
  ...DISPLAY_CHANGE.options
    .filter((option) => DISPLAY_TOOL_NAMES.has(actionOf(option)))
    .map(displayOption),
  KEEP,
  REVERT,
];

const AUDIO_INPUT = flatChange(AUDIO_CHANGE.options);

const DISPLAY_INPUT = flatChange(DISPLAY_OPTIONS);

const SYSTEM_INPUT = flatChange(SYSTEM_TOOL_CHANGE.options);

type DisplayRequest = z.output<typeof DISPLAY_INPUT>;

export async function changeAudio(
  context: OperatingContext,
  { deviceId: wanted, change }: Chosen<AudioChange>,
): Promise<Fields> {
  const deviceId = computerIdOf(context, wanted);
  const state = AUDIO_STATE.parse(await changed(context, 'changeComputerAudio', deviceId, change));
  return answered(audioSummary(change), compactAudio(state));
}

function displayHeadline(keep: boolean): string {
  return keep ? 'Screen change kept' : 'Screen change reverted';
}

async function screenOf(
  context: OperatingContext,
  deviceId: string,
  wanted: unknown,
): Promise<string> {
  if (typeof wanted === 'string') return wanted;
  const state = DISPLAY_STATE.parse(
    await operate(context, 'readComputerDisplays', { params: { deviceId } }),
  );
  const [only, second] = state.outputs;
  if (only !== undefined && second === undefined) return only.id;
  const listed = state.outputs.map((screen) => `${screen.name} (${screen.id})`).join(', ');
  throw new ToolError(`Say which screen with output: ${listed}`);
}

async function wireChange(
  context: OperatingContext,
  deviceId: string,
  change: DisplayRequest['change'],
): Promise<DisplayChange> {
  const { action: named, resolution, percent, ...rest } = change;
  const action = String(named);
  const output = NEEDS_SCREEN.has(action)
    ? { output: await screenOf(context, deviceId, rest['output']) }
    : {};
  const size = typeof resolution === 'string' ? resolution.split('x').map(Number) : [];
  const raw = {
    ...rest,
    action,
    ...output,
    ...(size.length === 2 ? { width: size[0], height: size[1] } : {}),
    ...(percent === undefined ? {} : action === 'brightness' ? { level: percent } : { percent }),
  };
  const parsed = DISPLAY_CHANGE.safeParse(raw);
  if (!parsed.success) {
    throw new ToolError(`The arguments are not valid: ${issuesOf(parsed.error)}`);
  }
  return parsed.data;
}

export async function changeDisplay(
  context: OperatingContext,
  { deviceId: wanted, change }: DisplayRequest,
): Promise<Fields> {
  const deviceId = computerIdOf(context, wanted);
  if (change['action'] === 'keep' || change['action'] === 'revert') {
    const keep = change['action'] === 'keep';
    const state = DISPLAY_STATE.parse(
      await changed(context, 'confirmComputerDisplay', deviceId, { keep }),
    );
    return answered(displayHeadline(keep), compactDisplays(state, false));
  }
  const applied = await wireChange(context, deviceId, change);
  const state = DISPLAY_STATE.parse(
    await changed(context, 'changeComputerDisplay', deviceId, applied),
  );
  const note = revertNote(state.pendingRevert?.revertsAt ?? null);
  return answered(`${displaySummary(applied)}${note}`, compactDisplays(state, false));
}

async function systemState(
  context: OperatingContext,
  deviceId: string,
  change: SystemToolChange,
): Promise<Fields> {
  if (change.action === 'startup_app') {
    const state = await changed(context, 'changeComputerStartup', deviceId, change);
    return compactStartup(STARTUP_STATE.parse(state));
  }
  if (change.action === 'service') {
    const state = await changed(context, 'changeComputerService', deviceId, change);
    return compactServices(SERVICES_STATE.parse(state));
  }
  const state = await changed(context, 'changeComputerSystem', deviceId, change);
  return compactSystem(SYSTEM_STATE.parse(state));
}

export async function changeSystem(
  context: OperatingContext,
  { deviceId: wanted, change }: Chosen<SystemToolChange>,
): Promise<Fields> {
  const deviceId = computerIdOf(context, wanted);
  return answered(systemSummary(change), await systemState(context, deviceId, change));
}

const WINDOW_INPUT = z.strictObject({
  deviceId: COMPUTER_ID,
  windowId: z.string().min(1).describe('A windowId from computer_read view windows'),
});

const WINDOW_PAST: Readonly<Record<WindowAction, string>> = {
  focus: 'brought to the front',
  minimise: 'minimised',
  close: 'closed',
};

export async function changeWindow(
  context: OperatingContext,
  wanted: string | undefined,
  windowId: string,
  action: WindowAction,
): Promise<Fields> {
  const deviceId = computerIdOf(context, wanted);
  const state = WINDOWS_STATE.parse(
    await changed(context, 'changeComputerWindow', deviceId, { windowId, action }),
  );
  return answered(`Window ${WINDOW_PAST[action]}`, compactWindows(state));
}

function windowTool(name: McpPartName, action: WindowAction): Tool {
  return defineTool({
    name,
    input: WINDOW_INPUT,
    annotations: {
      ...WRITES,
      idempotentHint: action !== 'close',
      destructiveHint: action === 'close',
    },
    answer: true,
    run: async (context, { deviceId, windowId }) => ({
      structured: await changeWindow(context, deviceId, windowId, action),
    }),
  });
}

export const COMPUTER_CONTROL_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'computer_audio_set',
    input: AUDIO_INPUT,
    annotations: { ...WRITES, idempotentHint: true },
    answer: true,
    run: async (context, request) => ({ structured: await changeAudio(context, request) }),
  }),
  defineTool({
    name: 'computer_display_set',
    input: DISPLAY_INPUT,
    annotations: WRITES,
    answer: true,
    run: async (context, request) => ({ structured: await changeDisplay(context, request) }),
  }),
  defineTool({
    name: 'computer_system_set',
    input: SYSTEM_INPUT,
    annotations: { ...WRITES, destructiveHint: true },
    answer: true,
    run: async (context, request) => ({ structured: await changeSystem(context, request) }),
  }),
  windowTool('focus_window', 'focus'),
  windowTool('minimise_window', 'minimise'),
  windowTool('close_window', 'close'),
];
