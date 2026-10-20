import { CommandRefusedError, type JsonValue } from '@smarteverything/domain';
import { IR_CODE, canonicalIrCode, irWrites, type IrCode } from '@smarteverything/tuya';
import { writeTo } from './writes';
import type { DeviceRecord } from './records';
import type { TuyaRuntime } from './runtime';
import { messageOf } from '@smarteverything/logging';

class IrSchemeUnknownError extends Error {
  override readonly name = 'IrSchemeUnknownError';

  constructor(readonly deviceId: string) {
    super(
      `IR blaster ${deviceId} has neither published nor shown its infrared data points, so a code cannot be sent to it as data points.`,
    );
  }
}

function result(code: IrCode): JsonValue {
  return { format: code.format, code: code.code };
}

export async function learnIr(runtime: TuyaRuntime, record: DeviceRecord): Promise<JsonValue> {
  const deviceId = record.cloud.id;
  const scheme = record.model.ir;
  if (scheme === null) {
    throw new IrSchemeUnknownError(deviceId);
  }
  const waiting = runtime.learn(deviceId, runtime.options.dependencies.timing.irLearnTimeoutMs);
  try {
    await writeTo(runtime, record, () => irWrites(scheme, { kind: 'study_exit' }));
    await writeTo(runtime, record, () => irWrites(scheme, { kind: 'study_start' }));
    return result(await waiting.result);
  } finally {
    waiting.cancel();
    await writeTo(runtime, record, () => irWrites(scheme, { kind: 'study_exit' })).catch(
      (cause: unknown) => {
        runtime.log.warn('tuya.ir_learning_not_ended', {
          deviceId,
          reason: messageOf(cause),
        });
      },
    );
  }
}

export async function sendIr(
  runtime: TuyaRuntime,
  record: DeviceRecord,
  value: unknown,
): Promise<JsonValue> {
  const parsed = IR_CODE.safeParse(value);
  if (!parsed.success) {
    throw new CommandRefusedError('ir_send', 'it needs a format of pulses or head_key and a code');
  }
  const code = canonicalIrCode(parsed.data);
  const scheme = record.model.ir;
  if (scheme === null) {
    throw new IrSchemeUnknownError(record.cloud.id);
  }
  await writeTo(runtime, record, () => irWrites(scheme, { kind: 'send', code }));
  return null;
}
