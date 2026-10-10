import { readFile, stat } from 'node:fs/promises';
import type { RecordingRow } from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import { reported, sendAndWait } from './commanding';
import { IMAGE_LIMIT_BYTES, LIVE_CAMERA_TOOL, SNAPSHOT_TYPE } from './camera-live';
import { READS, ToolError, WRITES, defineTool, type Tool, type ToolContext } from './registry';
import { nameOf, placedDevice } from './targets';

const PAGE = 100;

function latestSnapshot(store: Store, deviceId: string): RecordingRow {
  let before: string | undefined;
  for (;;) {
    const page = store.cameras.recordings({ deviceIds: [deviceId], to: before, limit: PAGE });
    const snapshot = page.find((recording) => recording.kind === 'snapshot');
    const last = page.at(-1);
    if (snapshot !== undefined) {
      return snapshot;
    }
    if (last === undefined || page.length < PAGE) {
      throw new ToolError(
        `The camera ${deviceId} has no saved snapshot; take_camera_snapshots takes one now`,
        'not_found',
      );
    }
    before = last.started_at;
  }
}

async function imageOf(context: ToolContext, recording: RecordingRow): Promise<string> {
  const path = context.recordingPath(recording.storage_path);
  const size = (await stat(path)).size;
  if (size > IMAGE_LIMIT_BYTES) {
    throw new ToolError(
      `The snapshot ${recording.id} is ${String(size)} bytes, more than the ${String(IMAGE_LIMIT_BYTES)} an assistant accepts`,
    );
  }
  return (await readFile(path)).toString('base64');
}

const SAVED = z
  .strictObject({
    deviceId: z.uuid().optional().describe('The newest snapshot of this camera'),
    recordingId: z
      .uuid()
      .optional()
      .describe('One saved snapshot, such as one listed with an event'),
  })
  .refine((input) => (input.deviceId === undefined) !== (input.recordingId === undefined), {
    message: 'give deviceId or recordingId',
  });

function recordingFor(store: Store, input: z.infer<typeof SAVED>): RecordingRow {
  if (input.recordingId === undefined) {
    if (input.deviceId === undefined) {
      throw new ToolError('Give deviceId or recordingId');
    }
    placedDevice(store, input.deviceId);
    return latestSnapshot(store, input.deviceId);
  }
  const recording = store.cameras.recording(input.recordingId);
  if (recording.kind !== 'snapshot') {
    throw new ToolError(
      `Recording ${recording.id} is a video clip; assistants receive images only`,
      'not_supported',
    );
  }
  return recording;
}

export const CAMERA_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'get_camera_snapshot',
    input: SAVED,
    annotations: READS,
    run: async (context, input) => {
      const recording = recordingFor(context.store, input);
      const device = context.store.devices.find(recording.device_id);
      return {
        structured: {
          deviceId: recording.device_id,
          device: device === undefined ? null : nameOf(context.store, device),
          recordingId: recording.id,
          takenAt: recording.started_at,
          mimeType: SNAPSHOT_TYPE,
        },
        images: [{ data: await imageOf(context, recording), mimeType: SNAPSHOT_TYPE }],
      };
    },
  }),
  LIVE_CAMERA_TOOL,
  defineTool({
    name: 'record_camera_clip',
    input: z.strictObject({
      deviceId: z.uuid(),
      seconds: z.int().min(5).max(300).default(30),
    }),
    annotations: { ...WRITES, openWorldHint: true },
    run: async (context, input) => {
      const outcome = await sendAndWait(context, [
        { device_id: null, capability: 'hub:record_clip', value: input },
      ]);
      return { structured: reported(context, outcome) };
    },
  }),
];
