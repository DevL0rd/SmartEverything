import { NativeModule, requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { CLIENT_NATIVE_TRACE } from '@smarteverything/domain';
import { isNative } from '../design/platform';
import { processExitRecord } from './process-exit-log';

const log = new Logger('app.process');

const EXITS = z.array(
  z.object({
    reason: z.string(),
    description: z.string().nullable(),
    at: z.number(),
    status: z.number(),
    processName: z.string(),
    nativeTrace: CLIENT_NATIVE_TRACE.optional(),
  }),
);

declare class DiagnosticsNative extends NativeModule {
  recentProcessExits(): Promise<unknown>;
}

const diagnostics = requireOptionalNativeModule<DiagnosticsNative>('Diagnostics');

export async function readProcessExitLogs(
  after: number,
  before: number,
): Promise<readonly LogRecord[]> {
  if (!isNative()) return [];
  if (
    diagnostics === null ||
    typeof Reflect.get(diagnostics, 'recentProcessExits') !== 'function'
  ) {
    log.info('exits.unavailable', { reason: 'this app build has no process exit history' });
    return [];
  }
  const exits = EXITS.parse(await diagnostics.recentProcessExits());
  return exits
    .filter((exit) => exit.at >= after && exit.at < before)
    .reverse()
    .map((exit) =>
      processExitRecord({
        at: new Date(exit.at).toISOString(),
        reason: exit.reason,
        description: exit.description,
        status: exit.status,
        process: exit.processName,
        ...(exit.nativeTrace === undefined ? {} : { nativeTrace: exit.nativeTrace }),
      }),
    );
}
