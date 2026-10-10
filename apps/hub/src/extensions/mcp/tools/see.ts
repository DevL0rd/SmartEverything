import { COMPUTER_CAPTURE, SEE_REQUEST, type CaptureTarget } from '@smarteverything/domain';
import { operate } from './acting';
import { IMAGE_LIMIT_BYTES, SNAPSHOT_TYPE, shotOf } from './camera-live';
import { READS, ToolError, defineTool, matches, type Tool, type ToolContext } from './registry';
import { placedDevices, type Placed } from './targets';

const FOCUSED_APP = 'focused_app';

function only(found: readonly Placed[], wanted: string, noun: string): Placed {
  const [first] = found;
  if (first === undefined) {
    throw new ToolError(`There is no ${noun} matching "${wanted}"`, 'not_found');
  }
  if (found.length > 1) {
    const names = found.map((placed) => placed.name).join(', ');
    throw new ToolError(`"${wanted}" matches more than one ${noun}: ${names}`);
  }
  return first;
}

function named(candidates: readonly Placed[], wanted: string, noun: string): Placed {
  const exact = candidates.filter(
    ({ device, name }) =>
      device.id === wanted ||
      name.toLowerCase() === wanted.toLowerCase() ||
      device.name.toLowerCase() === wanted.toLowerCase(),
  );
  if (exact.length > 0) {
    return only(exact, wanted, noun);
  }
  return only(
    candidates.filter(({ name, device }) => matches(wanted, name, device.name)),
    wanted,
    noun,
  );
}

function computerOf(context: ToolContext, wanted: string | undefined): Placed {
  const computers = placedDevices(context.store).filter(({ device }) => device.kind === 'computer');
  if (wanted !== undefined) {
    return named(computers, wanted, 'computer');
  }
  const [first] = computers;
  if (first === undefined) {
    throw new ToolError('This home has no computer to look at', 'not_found');
  }
  if (computers.length > 1) {
    throw new ToolError(`Say which computer: ${computers.map((placed) => placed.name).join(', ')}`);
  }
  return first;
}

function cameraOf(context: ToolContext, wanted: string): Placed {
  const cameras = new Set(context.store.cameras.list().map((camera) => camera.device_id));
  return named(
    placedDevices(context.store).filter(({ device }) => cameras.has(device.id)),
    wanted,
    'camera',
  );
}

function frontApp(context: ToolContext, computer: Placed): string {
  const row = context.store.state
    .list()
    .find((state) => state.device_id === computer.device.id && state.capability === FOCUSED_APP);
  return typeof row?.value === 'string' ? row.value : '';
}

async function captured(
  context: ToolContext,
  computer: Placed,
  target: CaptureTarget,
): Promise<{ readonly at: string; readonly data: string }> {
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
    const computer = computerOf(context, input.computer);
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
      structured: { source: input.source, what, at: capture.at },
      images: [{ data: capture.data, mimeType: SNAPSHOT_TYPE }],
    };
  },
});
