import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModule, requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { isNative } from '../design/platform';

const log = new Logger('app.process');

const SEEN_KEY = 'smarteverything.last-exit-seen';

const NORMAL_EXITS: readonly string[] = ['exit_self', 'user_requested', 'user_stopped', 'unknown'];

const EXIT = z.object({
  reason: z.string(),
  description: z.string().nullable(),
  at: z.number(),
  importance: z.number(),
  status: z.number(),
  processName: z.string(),
  pssKb: z.number(),
  rssKb: z.number(),
});

const EXITS = z.array(EXIT);

declare class DiagnosticsNative extends NativeModule {
  recentProcessExits(): Promise<unknown>;
}

const diagnostics = requireOptionalNativeModule<DiagnosticsNative>('Diagnostics');

export async function reportProcessExits(): Promise<void> {
  if (!isNative()) {
    return;
  }
  if (
    diagnostics === null ||
    typeof Reflect.get(diagnostics, 'recentProcessExits') !== 'function'
  ) {
    log.info('exits.unavailable', { reason: 'this app build has no process exit history' });
    return;
  }
  const exits = EXITS.parse(await diagnostics.recentProcessExits());
  const seen = Number(await AsyncStorage.getItem(SEEN_KEY));
  const fresh = exits.filter((exit) => exit.at > seen).reverse();
  for (const exit of fresh) {
    const detail = {
      reason: exit.reason,
      description: exit.description ?? '',
      at: new Date(exit.at).toISOString(),
      importance: exit.importance,
      status: exit.status,
      process: exit.processName,
      pssKb: exit.pssKb,
      rssKb: exit.rssKb,
    };
    if (NORMAL_EXITS.includes(exit.reason)) {
      log.info('process.exited', detail);
    } else {
      log.error(
        'process.exited_abnormally',
        new Error(`The app process ended: ${exit.reason}`),
        detail,
      );
    }
  }
  const newest = exits[0];
  if (newest !== undefined) {
    await AsyncStorage.setItem(SEEN_KEY, String(newest.at));
  }
}
