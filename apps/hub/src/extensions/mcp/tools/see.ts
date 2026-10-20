import {
  COMPUTER_CAPTURE,
  type ComputerCapture,
  PHONE_ACTION_RESULT,
  SEE_REQUEST,
  type CaptureTarget,
} from '@smarteverything/domain';
import { operate, type OperatingContext } from './acting';
import { IMAGE_LIMIT_BYTES, SNAPSHOT_TYPE, shotOf } from './camera-live';
import { deviceScopeOfActor } from './person-reach';
import { READS, ToolError, defineTool, matches, type Tool, type ToolContext } from './registry';
import { placedDevices, resolveNamed, type Naming, type Placed } from './targets';

const FOCUSED_APP = 'focused_app';

const PLACED_NAMING: Naming<Placed> = {
  names: ({ name, device }) => [name, device.name],
  label: ({ name }) => name,
  id: ({ device }) => device.id,
};

export function pictureSizeOf(capture: Pick<ComputerCapture, 'width' | 'height'>): string {
  return `${String(capture.width)}x${String(capture.height)} pixels; coordinates for use_computer are in this size, whatever size the picture looks`;
}

export function machineOf(
  context: Pick<ToolContext, 'store' | 'actor'>,
  kind: 'computer' | 'phone',
  wanted: string | undefined,
): Placed {
  const machines = placedDevices(context.store, deviceScopeOfActor(context)).filter(
    ({ device }) => device.kind === kind,
  );
  if (wanted !== undefined) {
    return resolveNamed(machines, wanted, kind, PLACED_NAMING);
  }
  const [first] = machines;
  if (first === undefined) {
    throw new ToolError(`This home has no ${kind} to look at`, 'not_found');
  }
  if (machines.length > 1) {
    throw new ToolError(
      `Say which ${kind}: ${machines.map((placed) => `${placed.name} (id ${placed.device.id})`).join(', ')}`,
    );
  }
  return first;
}

function cameraOf(context: ToolContext, wanted: string): Placed {
  const cameras = new Set(context.store.cameras.list().map((camera) => camera.device_id));
  return resolveNamed(
    placedDevices(context.store, deviceScopeOfActor(context)).filter(({ device }) =>
      cameras.has(device.id),
    ),
    wanted,
    'camera',
    PLACED_NAMING,
  );
}

function frontApp(context: ToolContext, computer: Placed): string {
  const value = context.store.state.value(computer.device.id, FOCUSED_APP);
  return typeof value === 'string' ? value : '';
}

async function captured(
  context: ToolContext,
  computer: Placed,
  target: CaptureTarget,
): Promise<ComputerCapture> {
  const capture = COMPUTER_CAPTURE.parse(
    await operate(context, 'captureComputer', {
      params: { deviceId: computer.device.id },
      body: { target },
    }),
  );
  if (Buffer.from(capture.data, 'base64').byteLength > IMAGE_LIMIT_BYTES) {
    throw new ToolError(`The picture of ${computer.name} is too large for an assistant`);
  }
  return capture;
}

export async function phoneShot(
  context: OperatingContext & Pick<ToolContext, 'clock'>,
  phone: Placed,
): Promise<{ readonly data: string; readonly at: string }> {
  const result = PHONE_ACTION_RESULT.parse(
    await operate(context, 'runPhoneAction', {
      params: { deviceId: phone.device.id },
      body: { type: 'screenshot' },
    }),
  );
  if (!result.ok) {
    throw new ToolError(result.detail);
  }
  if (result.image === undefined) {
    throw new ToolError(`${phone.name} answered without a picture`);
  }
  if (Buffer.from(result.image, 'base64').byteLength > IMAGE_LIMIT_BYTES) {
    throw new ToolError(`The picture of ${phone.name} is too large for an assistant`);
  }
  return { data: result.image, at: context.clock.now().toISOString() };
}

export const SEE_TOOL: Tool = defineTool({
  name: 'see',
  input: SEE_REQUEST,
  annotations: { ...READS, idempotentHint: false, openWorldHint: true },
  run: async (context, input) => {
    if (input.source === 'home_camera') {
      const shot = await shotOf(context, cameraOf(context, input.camera), 'full');
      if (shot.image === null) {
        throw new ToolError(`That camera cannot be seen right now: ${JSON.stringify(shot.item)}`);
      }
      return {
        structured: { source: input.source, what: shot.item['camera'], at: shot.item['takenAt'] },
        images: [shot.image],
      };
    }
    if (input.source === 'phone_screenshot') {
      const phone = machineOf(context, 'phone', input.phone);
      const shot = await phoneShot(context, phone);
      return {
        structured: { source: input.source, what: `${phone.name} screen`, at: shot.at },
        images: [{ data: shot.data, mimeType: SNAPSHOT_TYPE }],
      };
    }
    const computer = machineOf(context, 'computer', input.computer);
    if (input.source === 'desktop_window') {
      const front = frontApp(context, computer);
      if (!matches(input.window, front)) {
        throw new ToolError(
          `"${input.window}" is not the window in front on ${computer.name}${front === '' ? '' : ` (${front} is)`}; the SmartEverything app can show any window while they share it`,
          'not_supported',
        );
      }
    }
    const capture = await captured(
      context,
      computer,
      input.source === 'desktop_window' ? 'focused' : 'screen',
    );
    const what =
      input.source === 'desktop_window'
        ? `${input.window} on ${computer.name}`
        : `${computer.name} screen`;
    return {
      structured: {
        source: input.source,
        what,
        at: capture.at,
        ...(input.source === 'desktop_screen' ? { pictureSize: pictureSizeOf(capture) } : {}),
      },
      images: [{ data: capture.data, mimeType: SNAPSHOT_TYPE }],
    };
  },
});
