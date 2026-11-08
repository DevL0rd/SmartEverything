import { z } from 'zod';
import {
  VACUUM_SLOT,
  VACUUM_SLOTS,
  VacuumValueError,
  type JsonValue,
  type VacuumPose,
  type VacuumSlot,
} from '@smarteverything/domain';

const MAP_VERSION = new RegExp(`^(\\d+):(${VACUUM_SLOTS.join('|')})$`, 'u');

const POSE_TEXT = z.looseObject({ x: z.number(), y: z.number(), yaw: z.number() });

const LIVE_POSE_TEXT = POSE_TEXT.extend({ cursor: z.number().int().nonnegative() });

export interface VacuumLivePose extends VacuumPose {
  readonly cursor: number;
}

export interface VacuumMapVersion {
  readonly version: string;
  readonly index: number;
  readonly slot: VacuumSlot;
}

export function parseMapVersion(text: JsonValue | undefined): VacuumMapVersion | null {
  if (text === undefined || text === '') {
    return null;
  }
  const match = typeof text === 'string' ? MAP_VERSION.exec(text) : null;
  if (match === null || typeof text !== 'string') {
    throw new VacuumValueError('raw:vacuum_map', 'a map version written index:slot', text);
  }
  return { version: text, index: Number(match[1]), slot: VACUUM_SLOT.parse(match[2]) };
}

const POSE_EXPECTED = 'a JSON object with x, y and yaw';

function poseJson(text: JsonValue): unknown {
  if (typeof text !== 'string') {
    throw new VacuumValueError('raw:vacuum_pose', POSE_EXPECTED, text);
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new VacuumValueError('raw:vacuum_pose', POSE_EXPECTED, text, { cause });
  }
}

export function parsePose(text: JsonValue | undefined): VacuumPose | null {
  if (text === undefined || text === '') {
    return null;
  }
  const parsed = POSE_TEXT.safeParse(poseJson(text));
  if (!parsed.success) {
    throw new VacuumValueError('raw:vacuum_pose', POSE_EXPECTED, text);
  }
  return { x: parsed.data.x, y: parsed.data.y, yaw: parsed.data.yaw };
}

const LIVE_POSE_EXPECTED = 'a JSON object with x, y, yaw and a route cursor';

export function parseLivePose(text: JsonValue | undefined): VacuumLivePose | null {
  if (text === undefined || text === '') {
    return null;
  }
  const parsed = LIVE_POSE_TEXT.safeParse(poseJson(text));
  if (!parsed.success) {
    throw new VacuumValueError('raw:vacuum_pose', LIVE_POSE_EXPECTED, text);
  }
  const { x, y, yaw, cursor } = parsed.data;
  return { x, y, yaw, cursor };
}
