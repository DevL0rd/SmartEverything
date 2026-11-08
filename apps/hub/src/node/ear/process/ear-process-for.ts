import { fileURLToPath } from 'node:url';
import { Logger } from '@smarteverything/logging';
import { systemClock } from '../../../clock';
import { ChildHost } from '../../../plugins/isolation/child-host';
import { forkChild } from '../../../plugins/isolation/spawn';
import type { EarHostFactory } from '../ear-host';
import { COMPUTER_VERSION } from '../../computer-version';
import { EarProcess } from './ear-process';

const EAR_PROCESS = fileURLToPath(new URL('./ear-process.mjs', import.meta.url));

export interface EarProcessForOptions {
  readonly wakeDiagnosticsDirectory: string | null;
  readonly logPath: string;
  readonly log: Logger;
}

export function earProcessFor(options: EarProcessForOptions): EarProcess {
  return new EarProcess({
    host: new ChildHost({
      kind: 'ear',
      spawn: forkChild({
        kind: 'ear',
        entry: EAR_PROCESS,
        output: { source: 'service:ear', scope: 'hub.ear-process', event: 'service.output' },
      }),
      log: options.log,
    }),
    wakeDiagnosticsDirectory: options.wakeDiagnosticsDirectory,
    logPath: options.logPath,
    release: COMPUTER_VERSION,
    level: Logger.level,
    clock: systemClock,
    log: options.log,
  });
}

export function earHostFactoryOf(process: EarProcess): EarHostFactory {
  return (send, scored, scoreFailed) => process.hostPort({ send, scored, scoreFailed });
}
