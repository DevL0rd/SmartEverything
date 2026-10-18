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
import { COMPUTER_ID, actionOf, flatChange, type Chosen } from './computer-flat';
import { WRITES, defineTool, type Tool } from './registry';

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

const DISPLAY_OPTIONS = [
  ...DISPLAY_CHANGE.options.filter((option) => DISPLAY_TOOL_NAMES.has(actionOf(option))),
  KEEP,
  REVERT,
];

const AUDIO_INPUT = flatChange(AUDIO_CHANGE.options);

const DISPLAY_INPUT = flatChange(DISPLAY_OPTIONS);

const SYSTEM_INPUT = flatChange(SYSTEM_TOOL_CHANGE.options);

type DisplayRequest = z.output<typeof DISPLAY_INPUT>;

export async function changeAudio(
  context: OperatingContext,
  { deviceId, change }: Chosen<AudioChange>,
): Promise<Fields> {
  const state = AUDIO_STATE.parse(await changed(context, 'changeComputerAudio', deviceId, change));
  return answered(audioSummary(change), compactAudio(state));
}

function displayHeadline(change: DisplayRequest['change']): string {
  if (change.action === 'keep') return 'Screen change kept';
  return change.action === 'revert' ? 'Screen change reverted' : displaySummary(change);
}

export async function changeDisplay(
  context: OperatingContext,
  { deviceId, change }: DisplayRequest,
): Promise<Fields> {
  const confirming = change.action === 'keep' || change.action === 'revert';
  const state = DISPLAY_STATE.parse(
    confirming
      ? await changed(context, 'confirmComputerDisplay', deviceId, {
          keep: change.action === 'keep',
        })
      : await changed(context, 'changeComputerDisplay', deviceId, change),
  );
  const note = revertNote(state.pendingRevert?.revertsAt ?? null);
  return answered(`${displayHeadline(change)}${note}`, compactDisplays(state, false));
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
  { deviceId, change }: Chosen<SystemToolChange>,
): Promise<Fields> {
  return answered(systemSummary(change), await systemState(context, deviceId, change));
}

const WINDOW_INPUT = z.strictObject({
  deviceId: COMPUTER_ID,
  windowId: z.string().min(1).describe('A windowId from get_computer view windows'),
});

const WINDOW_PAST: Readonly<Record<WindowAction, string>> = {
  focus: 'brought to the front',
  minimise: 'minimised',
  close: 'closed',
};

export async function changeWindow(
  context: OperatingContext,
  deviceId: string,
  windowId: string,
  action: WindowAction,
): Promise<Fields> {
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
    name: 'set_computer_audio',
    input: AUDIO_INPUT,
    annotations: { ...WRITES, idempotentHint: true },
    answer: true,
    run: async (context, request) => ({ structured: await changeAudio(context, request) }),
  }),
  defineTool({
    name: 'set_computer_display',
    input: DISPLAY_INPUT,
    annotations: WRITES,
    answer: true,
    run: async (context, request) => ({ structured: await changeDisplay(context, request) }),
  }),
  defineTool({
    name: 'set_computer_system',
    input: SYSTEM_INPUT,
    annotations: { ...WRITES, destructiveHint: true },
    answer: true,
    run: async (context, request) => ({ structured: await changeSystem(context, request) }),
  }),
  windowTool('focus_window', 'focus'),
  windowTool('minimise_window', 'minimise'),
  windowTool('close_window', 'close'),
];
