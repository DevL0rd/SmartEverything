import { setTimeout as sleep } from 'node:timers/promises';
import { CommandRefusedError, type JsonValue } from '@smarteverything/domain';
import {
  CLOUD_PATHS,
  COMMAND_ACCEPTED,
  IR_CODE,
  IR_LEARNED,
  canonicalIrCode,
  irWrites,
  learnedCodeFromHex,
  libraryCommandBody,
  parseLibraryKey,
  type IrCode,
} from '@smarteverything/tuya';
import { projectOf } from './backend';
import type { TuyaCloud } from './cloud-client';
import { writeTo } from './writes';
import { IrLearnTimeoutError } from './learners';
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

async function setCloudLearning(
  project: TuyaCloud,
  deviceId: string,
  state: boolean,
): Promise<void> {
  await project.call(
    `${state ? 'starting' : 'ending'} IR learning on ${deviceId}`,
    { method: 'PUT', path: CLOUD_PATHS.irLearningState(deviceId), query: { state: String(state) } },
    COMMAND_ACCEPTED,
  );
}

async function learnThroughCloud(runtime: TuyaRuntime, deviceId: string): Promise<JsonValue> {
  const { now, timing } = runtime.options.dependencies;
  const project = projectOf(runtime.backend, 'Learning an IR code through the cloud');
  const startedAt = now();
  await setCloudLearning(project, deviceId, true);
  runtime.log.info('tuya.ir_learning_queried', {
    deviceId,
    intervalMs: timing.cloudLearnQueryMs,
    reason:
      'Tuya returns a code learned by a blaster without a LAN path only through its learning-codes query',
  });
  try {
    while (now() - startedAt < timing.irLearnTimeoutMs) {
      await sleep(timing.cloudLearnQueryMs);
      const learned = await project.call(
        `reading the code learned by ${deviceId}`,
        {
          method: 'GET',
          path: CLOUD_PATHS.irLearningCodes(deviceId),
          query: { learning_time: String(startedAt) },
        },
        IR_LEARNED,
      );
      if (learned.success && learned.code !== null) {
        return result(learnedCodeFromHex(learned.code));
      }
    }
    throw new IrLearnTimeoutError(deviceId, timing.irLearnTimeoutMs);
  } finally {
    await setCloudLearning(project, deviceId, false).catch((cause: unknown) => {
      runtime.log.warn('tuya.ir_learning_not_ended', {
        deviceId,
        reason: messageOf(cause),
      });
    });
  }
}

export async function learnIr(runtime: TuyaRuntime, record: DeviceRecord): Promise<JsonValue> {
  const deviceId = record.cloud.id;
  const scheme = record.model.ir;
  if (scheme === null) {
    if (runtime.choiceOf(deviceId).transport === 'cloud') {
      return learnThroughCloud(runtime, deviceId);
    }
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
    throw new CommandRefusedError(
      'ir_send',
      'it needs a format of pulses, head_key or library and a code',
    );
  }
  const code = canonicalIrCode(parsed.data);
  if (code.format === 'library') {
    const key = parseLibraryKey(code.code);
    await projectOf(runtime.backend, 'Sending an IR library key').call(
      `sending IR key ${key.key} through ${record.cloud.id}`,
      {
        method: 'POST',
        path: CLOUD_PATHS.irKeyCommand(record.cloud.id, key.remoteId),
        body: libraryCommandBody(key),
      },
      COMMAND_ACCEPTED,
    );
    return null;
  }
  const scheme = record.model.ir;
  if (scheme === null) {
    throw new IrSchemeUnknownError(record.cloud.id);
  }
  await writeTo(runtime, record, () => irWrites(scheme, { kind: 'send', code }));
  return null;
}
