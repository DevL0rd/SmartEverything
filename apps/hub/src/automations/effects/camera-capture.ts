import {
  ApiError,
  HUB_COMMAND,
  MEDIA_SIZES,
  isPrivate,
  privacySwitchOf,
  type CommandRow,
  type DeviceRow,
  type JsonValue,
  type MediaSize,
} from '@smarteverything/domain';
import type { Outputs } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { Clock } from '../../clock';
import { resolveTarget } from '../../device-groups/commands';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import { deviceRefs } from '../world-v3/refs';
import { modeOf } from './action-mode';
import type { CameraPictures, TakenPicture } from './camera-pictures';
import {
  CAMERA_TARGET,
  CAMERA_VALUE,
  isCamera,
  skippedOutput,
  type Skipped,
} from './camera-support';
import { stampOf, type CommandStamp } from './command-metadata';
import { deliver } from './deliver';
import type { EffectHandler, EffectHandlers, EffectRun } from './effect-run';
import { AutomationRunCancelledError, awaitRun } from './run-abort';

export interface ClipCommand {
  readonly deviceId: null;
  readonly capability: 'hub:record_clip';
  readonly value: JsonValue;
}

export interface ClipIssuer {
  readonly issue: (
    commands: readonly ClipCommand[],
    source: 'automation',
    run: EffectRun,
    options: { readonly at: CommandStamp },
  ) => Promise<readonly CommandRow[]>;
}

export interface CameraCapturePorts {
  readonly store: Store;
  readonly clock: Pick<Clock, 'now'>;
  readonly issuer: ClipIssuer;
  readonly pictures: Pick<CameraPictures, 'take'>;
}

const CLIP_SECONDS_DEFAULT = 30;

const EVERY_CLIP = Number.MAX_SAFE_INTEGER;

const RECORD_PARAMS = z.object({
  camera: CAMERA_VALUE,
  seconds: z.number().default(CLIP_SECONDS_DEFAULT),
});

const CLIP_RESULT = z.object({ storagePath: z.string().min(1) });

const SNAPSHOT_PARAMS = z.object({
  camera: CAMERA_VALUE.optional(),
  target: CAMERA_TARGET.optional(),
  size: z.enum(MEDIA_SIZES).default('full'),
});

interface SavedClip {
  readonly id: string;
  readonly at: string;
}

interface Taken {
  readonly deviceId: string;
  readonly picture: TakenPicture;
}

interface Failed {
  readonly deviceId: string;
  readonly cause: unknown;
}

interface Pictures {
  readonly taken: readonly Taken[];
  readonly skipped: readonly Skipped[];
}

function recordable(store: Store, id: string): DeviceRow {
  const device = store.devices.find(id);
  if (device === undefined) throw new ApiError('not_found', 'There is no such camera.');
  if (!isCamera(device)) throw new ApiError('invalid_request', `${device.name} is not a camera.`);
  if (!device.online) throw new ApiError('camera_offline', `${device.name} is offline.`);
  const privacy = privacySwitchOf(device);
  if (privacy !== null && isPrivate(privacy, store.state.value(device.id, privacy.key)))
    throw new ApiError('camera_privacy_on', `${device.name} is switched off for privacy.`);
  return device;
}

function clipCommand(device: DeviceRow, seconds: number): ClipCommand {
  const checked = HUB_COMMAND.safeParse({
    capability: 'hub:record_clip',
    value: { deviceId: device.id, seconds },
  });
  if (!checked.success) throw new ApiError('invalid_request', z.prettifyError(checked.error));
  return { deviceId: null, capability: 'hub:record_clip', value: checked.data.value };
}

function savedClip(
  store: Store,
  recorded: { readonly device: DeviceRow; readonly row: CommandRow; readonly since: Date },
): SavedClip {
  const { device, row, since } = recorded;
  const result = CLIP_RESULT.safeParse(store.commands.byId(row.id).result);
  const clip = result.success
    ? store.cameras
        .recordings({
          deviceIds: [device.id],
          kind: 'clip',
          from: since.toISOString(),
          limit: EVERY_CLIP,
        })
        .find((candidate) => candidate.storage_path === result.data.storagePath)
    : undefined;
  if (clip === undefined)
    throw new ApiError('internal', `The clip of ${device.name} was recorded but is not saved.`);
  return { id: clip.id, at: clip.started_at };
}

function cameraRecord(ports: CameraCapturePorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(RECORD_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      const device = recordable(ports.store, checked.value.camera);
      const command = clipCommand(device, checked.value.seconds);
      const since = ports.clock.now();
      const rows = await deliver({
        kind: request.kind,
        mode: modeOf(request),
        run,
        work: () => ports.issuer.issue([command], 'automation', run, { at: stampOf(request.path) }),
      });
      const [row] = rows ?? [];
      if (row === undefined) return { ok: true, value: outputs({}) };
      const clip = savedClip(ports.store, { device, row, since });
      return { ok: true, value: outputs({ recordingId: clip.id, at: clip.at }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

async function attempt(
  ports: CameraCapturePorts,
  device: DeviceRow,
  size: MediaSize,
  run: EffectRun,
): Promise<Taken | Failed | Skipped> {
  if (!isCamera(device)) return { deviceId: device.id, reason: 'It is not a camera.' };
  try {
    return {
      deviceId: device.id,
      picture: await awaitRun(ports.pictures.take(device.id, size), run),
    };
  } catch (cause) {
    if (cause instanceof AutomationRunCancelledError) throw cause;
    return { deviceId: device.id, cause };
  }
}

function isTaken(outcome: Taken | Failed | Skipped): outcome is Taken {
  return 'picture' in outcome;
}

function isFailed(outcome: Taken | Failed | Skipped): outcome is Failed {
  return 'cause' in outcome;
}

async function several(
  ports: CameraCapturePorts,
  target: z.infer<typeof CAMERA_TARGET>,
  size: MediaSize,
  run: EffectRun,
): Promise<Pictures> {
  const devices = resolveTarget(ports.store, target);
  if (devices.length === 0) throw new ApiError('not_found', 'This target has no cameras.');
  const outcomes = await Promise.all(devices.map((device) => attempt(ports, device, size, run)));
  const taken = outcomes.filter(isTaken);
  const failed = outcomes.filter(isFailed);
  const [first] = failed;
  if (taken.length === 0 && first !== undefined) throw first.cause;
  if (taken.length === 0) throw new ApiError('not_found', 'This target has no cameras.');
  const skipped = outcomes.flatMap((outcome): readonly Skipped[] =>
    isTaken(outcome)
      ? []
      : [
          isFailed(outcome)
            ? { deviceId: outcome.deviceId, reason: effectFailure(outcome.cause).message }
            : outcome,
        ],
  );
  return { taken, skipped };
}

async function one(
  ports: CameraCapturePorts,
  camera: string,
  size: MediaSize,
  run: EffectRun,
): Promise<Pictures> {
  const picture = await awaitRun(ports.pictures.take(camera, size), run);
  return { taken: [{ deviceId: camera, picture }], skipped: [] };
}

function pictureOutputs(done: Pictures): Outputs {
  const [first] = done.taken;
  return outputs({
    image: first?.picture.id ?? null,
    at: first?.picture.at ?? null,
    images: done.taken.map((each) => each.picture.id),
    cameras: deviceRefs(done.taken.map((each) => each.deviceId)),
    skipped: skippedOutput(done.skipped),
  });
}

function cameraSnapshot(ports: CameraCapturePorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(SNAPSHOT_PARAMS, params);
    if (!checked.ok) return checked;
    const { camera, target, size } = checked.value;
    let taking: Promise<Pictures>;
    if (camera !== undefined && target === undefined) taking = one(ports, camera, size, run);
    else if (camera === undefined && target !== undefined)
      taking = several(ports, target, size, run);
    else
      return invalid(
        'Choose either one camera or cameras, a room or a group to take pictures from.',
      );
    try {
      return { ok: true, value: pictureOutputs(await taking) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function cameraCaptureEffects(ports: CameraCapturePorts): EffectHandlers {
  return { 'camera.record': cameraRecord(ports), 'camera.snapshot': cameraSnapshot(ports) };
}
