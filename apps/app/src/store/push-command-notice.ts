import type { PushCommandNotice } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { runPushCommand } from '../../modules/health-connect';

const log = new Logger('app.live');

export function runPushCommandNotice(message: PushCommandNotice): void {
  runPushCommand(message.command, JSON.stringify(message.payload)).catch((error: unknown) => {
    log.error('live.push_command_failed', error, { command: message.command });
  });
}
