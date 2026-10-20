import { COMPUTER_CAPTURE, COMPUTER_INPUT, type ComputerInput } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { operate, type OperatingContext } from './acting';
import { IMAGE_LIMIT_BYTES, SNAPSHOT_TYPE } from './camera-live';
import { flatChange } from './computer-flat';
import { pictureSizeOf } from './see';
import { PHYSICAL, defineTool, type Tool, type ToolOutput } from './registry';

const log = new Logger('hub.mcp-computer-input');

const LOOK = z
  .boolean()
  .optional()
  .describe('Also return a picture of the screen once the input is done');

const INPUT = flatChange(COMPUTER_INPUT.options.map((option) => option.extend({ look: LOOK })));

function point(input: Extract<ComputerInput, { x: number }>): string {
  return `(${String(input.x)}, ${String(input.y)})`;
}

export function inputSummary(input: ComputerInput): string {
  switch (input.action) {
    case 'click':
      return `Clicked at ${point(input)}`;
    case 'double_click':
      return `Double clicked at ${point(input)}`;
    case 'right_click':
      return `Right clicked at ${point(input)}`;
    case 'move':
      return `Moved the pointer to ${point(input)}`;
    case 'drag':
      return `Dragged from ${point(input)} to (${String(input.toX)}, ${String(input.toY)})`;
    case 'scroll':
      return `Scrolled at ${point(input)} by ${String(input.dx)} across and ${String(input.dy)} down`;
    case 'type':
      return `Typed ${String(Array.from(input.text).length)} characters`;
    case 'keys':
      return `Pressed ${input.keys}`;
  }
}

async function pictureOf(
  context: OperatingContext,
  deviceId: string,
): Promise<{
  readonly images: ToolOutput['images'];
  readonly note: string | null;
  readonly size: string | null;
}> {
  try {
    const capture = COMPUTER_CAPTURE.parse(
      await operate(context, 'captureComputer', {
        params: { deviceId },
        body: { target: 'screen' },
      }),
    );
    if (Buffer.from(capture.data, 'base64').byteLength > IMAGE_LIMIT_BYTES) {
      return {
        images: undefined,
        note: 'The picture of the screen is too large for an assistant',
        size: null,
      };
    }
    return {
      images: [{ data: capture.data, mimeType: SNAPSHOT_TYPE }],
      note: null,
      size: pictureSizeOf(capture),
    };
  } catch (cause) {
    log.warn('input.picture_failed', { reason: messageOf(cause) });
    return {
      images: undefined,
      note: `The input was done but the picture failed: ${messageOf(cause)}`,
      size: null,
    };
  }
}

export const USE_COMPUTER_INPUT = INPUT;

type Request = z.output<typeof INPUT>;

export async function useComputer(
  context: OperatingContext,
  { deviceId, change }: Request,
): Promise<ToolOutput> {
  const { look, ...input } = change;
  await operate(context, 'inputComputer', { params: { deviceId }, body: input });
  const summary = inputSummary(input);
  if (look !== true) return { structured: { ok: true, summary } };
  const picture = await pictureOf(context, deviceId);
  return {
    structured: {
      ok: true,
      summary,
      ...(picture.note === null ? {} : { picture: picture.note }),
      ...(picture.size === null ? {} : { pictureSize: picture.size }),
    },
    ...(picture.images === undefined ? {} : { images: picture.images }),
  };
}

export const COMPUTER_INPUT_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'use_computer',
    input: INPUT,
    annotations: PHYSICAL,
    answer: true,
    run: useComputer,
  }),
];
