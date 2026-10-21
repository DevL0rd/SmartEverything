import {
  AUDIO_STATE,
  COMPUTER_DETAIL,
  DISPLAY_STATE,
  SERVICES_STATE,
  STARTUP_STATE,
  SYSTEM_STATE,
  TILING_STATE,
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
  compactTiling,
  compactUsb,
  compactWindows,
} from './computer-compact';
import { COMPUTER_ID, computerIdOf } from './computer-target';
import { READS, defineTool, type Tool } from './registry';

const COMPUTER = z.strictObject({ deviceId: COMPUTER_ID });

const DISPLAYS = z.strictObject({
  deviceId: COMPUTER_ID,
  modes: z
    .boolean()
    .optional()
    .describe('true also lists every resolution and refresh rate each screen offers'),
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

function reader<T, R extends { readonly deviceId?: string | undefined }>(
  name: McpPartName,
  input: z.ZodType<R>,
  { endpoint, schema, project }: Reading<T, R>,
): Tool {
  return defineTool({
    name,
    input,
    annotations: READS,
    run: async (context, request) => {
      const deviceId = computerIdOf(context, request.deviceId);
      const state = await readState(context, endpoint, deviceId, schema);
      return { structured: project(state, request) };
    },
  });
}

function view<T>(
  endpoint: EndpointName,
  schema: z.ZodType<T>,
  project: (state: T) => Record<string, unknown>,
): Reading<T, { readonly deviceId?: string | undefined }> {
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
    name: 'computer_read',
    input: COMPUTER,
    annotations: READS,
    run: async (context, { deviceId }) => ({
      structured: await computerNow(context, computerIdOf(context, deviceId)),
    }),
  }),
  reader('get_computer_audio', COMPUTER, view('readComputerAudio', AUDIO_STATE, compactAudio)),
  reader('get_computer_displays', DISPLAYS, {
    endpoint: 'readComputerDisplays',
    schema: DISPLAY_STATE,
    project: (state, request) => compactDisplays(state, request.modes === true),
  }),
  reader('get_computer_system', COMPUTER, {
    endpoint: 'readComputerSystem',
    schema: SYSTEM_STATE,
    project: (state) => ({ ...compactSystem(state), ...compactUsb(state) }),
  }),
  reader(
    'get_computer_windows',
    COMPUTER,
    view('readComputerWindows', WINDOWS_STATE, compactWindows),
  ),
  reader('get_computer_tiling', COMPUTER, view('readComputerTiling', TILING_STATE, compactTiling)),
  defineTool({
    name: 'get_computer_services',
    input: COMPUTER,
    annotations: READS,
    run: async (context, { deviceId }) => {
      const id = computerIdOf(context, deviceId);
      const [services, startup] = await Promise.all([
        readState(context, 'readComputerServices', id, SERVICES_STATE),
        readState(context, 'readComputerStartup', id, STARTUP_STATE),
      ]);
      return { structured: { ...compactServices(services), ...compactStartup(startup) } };
    },
  }),
];
