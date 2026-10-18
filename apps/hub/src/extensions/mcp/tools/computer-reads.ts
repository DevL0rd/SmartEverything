import {
  AUDIO_STATE,
  COMPUTER_DETAIL,
  DISPLAY_STATE,
  SERVICES_STATE,
  STARTUP_STATE,
  SYSTEM_STATE,
  WINDOWS_STATE,
  type EndpointName,
  type McpPartName,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate, type OperatingContext } from './acting';
import {
  compactAudio,
  compactDisplays,
  compactNow,
  compactServices,
  compactStartup,
  compactSystem,
  compactUsb,
  compactWindows,
} from './computer-compact';
import { COMPUTER_ID } from './computer-flat';
import { READS, defineTool, type Tool } from './registry';

const COMPUTER = z.strictObject({ deviceId: COMPUTER_ID });

const DISPLAYS = z.strictObject({
  deviceId: COMPUTER_ID,
  modes: z
    .boolean()
    .optional()
    .describe('Also list every resolution and refresh rate each screen offers'),
});

export async function readState<T>(
  context: OperatingContext,
  endpoint: EndpointName,
  deviceId: string,
  schema: z.ZodType<T>,
): Promise<T> {
  return schema.parse(await operate(context, endpoint, { params: { deviceId } }));
}

interface Reading<T, R> {
  readonly endpoint: EndpointName;
  readonly schema: z.ZodType<T>;
  readonly project: (state: T, request: R) => Record<string, unknown>;
}

function reader<T, R extends { readonly deviceId: string }>(
  name: McpPartName,
  input: z.ZodType<R>,
  { endpoint, schema, project }: Reading<T, R>,
): Tool {
  return defineTool({
    name,
    input,
    annotations: READS,
    run: async (context, request) => {
      const state = await readState(context, endpoint, request.deviceId, schema);
      return { structured: project(state, request) };
    },
  });
}

function view<T>(
  endpoint: EndpointName,
  schema: z.ZodType<T>,
  project: (state: T) => Record<string, unknown>,
): Reading<T, { readonly deviceId: string }> {
  return { endpoint, schema, project };
}

export async function computerNow(
  context: OperatingContext,
  deviceId: string,
): Promise<Record<string, unknown>> {
  const detail = await operate(context, 'readComputer', {
    params: { deviceId },
    query: { fresh: 'true' },
  });
  return compactNow(COMPUTER_DETAIL.parse(detail));
}

export const COMPUTER_READ_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'get_computer',
    input: COMPUTER,
    annotations: READS,
    run: async (context, { deviceId }) => ({ structured: await computerNow(context, deviceId) }),
  }),
  reader('get_computer_audio', COMPUTER, view('readComputerAudio', AUDIO_STATE, compactAudio)),
  reader('get_computer_displays', DISPLAYS, {
    endpoint: 'readComputerDisplays',
    schema: DISPLAY_STATE,
    project: (state, request) => compactDisplays(state, request.modes === true),
  }),
  reader('get_computer_system', COMPUTER, view('readComputerSystem', SYSTEM_STATE, compactSystem)),
  reader('get_computer_usb', COMPUTER, view('readComputerSystem', SYSTEM_STATE, compactUsb)),
  reader(
    'get_computer_windows',
    COMPUTER,
    view('readComputerWindows', WINDOWS_STATE, compactWindows),
  ),
  reader(
    'get_computer_services',
    COMPUTER,
    view('readComputerServices', SERVICES_STATE, compactServices),
  ),
  reader(
    'get_computer_startup',
    COMPUTER,
    view('readComputerStartup', STARTUP_STATE, compactStartup),
  ),
];
