import type { RuntimeLogRecord } from '@smarteverything/domain';
import type { LogRecord } from '@smarteverything/logging';

function failureOf(failure: RuntimeLogRecord['failure']): Pick<LogRecord, 'failure'> {
  if (failure === undefined) return {};
  return {
    failure: {
      name: failure.name,
      message: failure.message,
      ...(failure.stack === undefined ? {} : { stack: failure.stack }),
      ...(failure.cause === undefined
        ? {}
        : {
            cause: {
              name: failure.cause.name,
              message: failure.cause.message,
              ...(failure.cause.stack === undefined ? {} : { stack: failure.cause.stack }),
            },
          }),
    },
  };
}

export function logRecordOf(record: RuntimeLogRecord): LogRecord {
  return {
    timestamp: record.timestamp,
    level: record.level,
    runtime: record.runtime,
    platform: record.platform,
    scope: record.scope,
    event: record.event,
    payload: record.payload ?? {},
    ...(record.durationMs === undefined ? {} : { durationMs: record.durationMs }),
    ...failureOf(record.failure),
    ...(record.release === undefined ? {} : { release: record.release }),
    ...(record.bundle === undefined ? {} : { bundle: record.bundle }),
    ...(record.deviceId === undefined ? {} : { deviceId: record.deviceId }),
    ...(record.actorId === undefined ? {} : { actorId: record.actorId }),
    ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
    ...(record.requestId === undefined ? {} : { requestId: record.requestId }),
  };
}
