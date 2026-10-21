import { readFile, stat } from 'node:fs/promises';
import type { DeviceScope, RecordingRow } from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import { reported, sendAndWait } from './commanding';
import { DEVICE_REFERENCE } from './references';
import { deviceScopeOfActor } from './person-reach';
import { IMAGE_LIMIT_BYTES, LIVE_CAMERA_TOOL, SNAPSHOT_TYPE } from './camera-live';
import { READS, ToolError, WRITES, defineTool, type Tool, type ToolContext } from './registry';
import { deviceNames, placedDevice } from './targets';

export function latestSnapshot(store: Store, deviceId: string): RecordingRow {
  const [snapshot] = store.cameras.recordings({
    deviceIds: [deviceId],
    kind: 'snapshot',
    limit: 1,
  });
  if (snapshot === undefined) {
    throw new ToolError(
      `The camera ${deviceId} has no saved snapshot; camera_read view live takes one now`,
      'not_found',
    );
  }
  return snapshot;
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
    deviceId: DEVICE_REFERENCE.optional(),
    recordingId: z
      .uuid()
      .optional()
      .describe('One saved snapshot, such as one listed with an event_find'),
  })
  .refine((input) => (input.deviceId === undefined) !== (input.recordingId === undefined), {
    message: 'give deviceId or recordingId',
  });

function recordingFor(
  store: Store,
  scope: DeviceScope | null,
  input: z.infer<typeof SAVED>,
): RecordingRow {
  if (input.recordingId === undefined) {
    if (input.deviceId === undefined) {
      throw new ToolError('Give deviceId or recordingId');
    }
    return latestSnapshot(store, placedDevice(store, scope, input.deviceId).device.id);
  }
  const recording = store.cameras.recording(input.recordingId);
  placedDevice(store, scope, recording.device_id);
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
      const recording = recordingFor(context.store, deviceScopeOfActor(context), input);
      return {
        structured: {
          deviceId: recording.device_id,
          device: deviceNames(context.store).get(recording.device_id) ?? null,
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
    name: 'camera_record',
    input: z.strictObject({
      deviceId: DEVICE_REFERENCE,
      seconds: z.int().min(5).max(300).default(30).describe('How long to record, 5 to 300 seconds'),
    }),
    annotations: { ...WRITES, openWorldHint: true },
    run: async (context, input) => {
      const outcome = await sendAndWait(context, [
        {
          device_id: null,
          capability: 'hub:record_clip',
          value: {
            deviceId: placedDevice(context.store, deviceScopeOfActor(context), input.deviceId)
              .device.id,
            seconds: input.seconds,
          },
        },
      ]);
      return { structured: reported(context, outcome) };
    },
  }),
];
