import { CLIENT_PROCESS_EXIT, type ClientProcessExit } from '@smarteverything/domain';
import { clip, type LogRecord } from '@smarteverything/logging';

const NORMAL_EXITS: ReadonlySet<string> = new Set([
  'exit_self',
  'user_requested',
  'user_stopped',
  'unknown',
  'code_15',
  'code_16',
  'package_state_change',
  'package_updated',
]);

function exitFailure(exit: ClientProcessExit): LogRecord['failure'] {
  if (NORMAL_EXITS.has(exit.reason)) return undefined;
  if (exit.nativeTrace?.state === 'java') {
    const { name, message, frame } = exit.nativeTrace;
    return {
      name,
      message: message ?? `An uncaught ${name} ended the app`,
      ...(frame === null ? {} : { stack: frame }),
    };
  }
  return { name: 'AppProcessExit', message: `The app process ended: ${exit.reason}` };
}

export function processExitRecord(exit: ClientProcessExit): LogRecord {
  const failure = exitFailure(exit);
  const java = exit.nativeTrace?.state === 'java';
  const processExit = CLIENT_PROCESS_EXIT.parse({
    ...exit,
    description: exit.description === null ? null : clip(exit.description, 240),
  });
  return {
    timestamp: exit.at,
    runtime: 'app',
    platform: 'android',
    scope: 'app.process',
    level: failure === undefined ? 'info' : java ? 'exception' : 'error',
    event:
      failure === undefined
        ? 'process.exited'
        : java
          ? 'native.uncaught'
          : 'process.exited_abnormally',
    payload: { processExit },
    ...(failure === undefined ? {} : { failure }),
  };
}
