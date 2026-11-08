import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { vacuumAction, vacuumProperty, type VacuumAction } from '@smarteverything/xiaomi';
import { z } from 'zod';
import type { VacuumCommandIo } from './command-service';

export const VIDEO_PAGE = { cancelUnlock: '0', unlock: '1', enter: '3', exit: '4' } as const;

export type VideoPage = (typeof VIDEO_PAGE)[keyof typeof VIDEO_PAGE];

const SERVICE = 'streamManagement';
const PASSWORD_ACCEPTED = 0;

const OUTPUT = z.array(z.looseObject({ piid: z.number().int(), value: JSON_VALUE }));

const VIDEO_STATUS = z.looseObject({
  video_switch_status: z.boolean(),
  physical_control_lock: z.boolean(),
  video_passwd_exist: z.boolean(),
});

const VERDICT = z.union([z.string().regex(/^-?\d+$/u), z.number().int()]).transform(Number);

export type VacuumVideoStatus = z.infer<typeof VIDEO_STATUS>;

export class VacuumVideoAnswerError extends Error {
  override readonly name = 'VacuumVideoAnswerError';

  constructor(
    readonly step: string,
    readonly expected: string,
    cause?: unknown,
  ) {
    super(
      `The robot answered ${step} with something else than ${expected}.`,
      cause === undefined ? undefined : { cause },
    );
  }
}

function addressOf(action: VacuumAction): { readonly siid: number; readonly aiid: number } {
  return { siid: action.siid, aiid: action.aiid };
}

function slotOf(action: VacuumAction, slots: readonly number[]): number {
  const [piid] = slots;
  if (piid === undefined) {
    throw new VacuumVideoAnswerError(action.name, 'an action with an input and output slot');
  }
  return piid;
}

function outputOf(action: VacuumAction, out: JsonValue): JsonValue {
  const piid = slotOf(action, action.outputs);
  const parsed = OUTPUT.safeParse(out);
  const found = parsed.success ? parsed.data.find((entry) => entry.piid === piid) : undefined;
  if (found === undefined) {
    throw new VacuumVideoAnswerError(action.name, `an output in slot ${String(piid)}`);
  }
  return found.value;
}

function statusOf(action: VacuumAction, value: JsonValue): VacuumVideoStatus {
  let decoded: unknown;
  try {
    decoded = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (cause) {
    throw new VacuumVideoAnswerError(action.name, 'a JSON video status', cause);
  }
  const parsed = VIDEO_STATUS.safeParse(decoded);
  if (!parsed.success) {
    throw new VacuumVideoAnswerError(action.name, 'the switch, lock and password flags');
  }
  return parsed.data;
}

export async function readVideoStatus(io: VacuumCommandIo): Promise<VacuumVideoStatus> {
  const action = vacuumAction(SERVICE, 'get-video-status');
  return statusOf(action, outputOf(action, await io.action(addressOf(action), [])));
}

export async function enterVideoPage(io: VacuumCommandIo, page: VideoPage): Promise<void> {
  const action = vacuumAction(SERVICE, 'enter-exit-video-page');
  await io.action(addressOf(action), [{ piid: slotOf(action, action.inputs), value: page }]);
}

export async function verifyVideoPassword(io: VacuumCommandIo, password: string): Promise<boolean> {
  const action = vacuumAction(SERVICE, 'verify-video-password');
  const out = await io.action(addressOf(action), [
    { piid: slotOf(action, action.inputs), value: password },
  ]);
  const verdict = VERDICT.safeParse(outputOf(action, out));
  if (!verdict.success) {
    throw new VacuumVideoAnswerError(action.name, 'a number verdict');
  }
  return verdict.data === PASSWORD_ACCEPTED;
}

export async function switchVideo(io: VacuumCommandIo, on: boolean): Promise<void> {
  const property = vacuumProperty(SERVICE, 'on');
  await io.write([{ siid: property.siid, piid: property.piid, value: on }]);
}
