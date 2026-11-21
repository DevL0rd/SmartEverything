import type { CommandRow, RowChange } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';

export interface AssumedStateOptions {
  readonly store: Pick<Store, 'host'>;
  readonly now: () => Date;
  readonly log: Logger;
}

export class IrAssumedState {
  constructor(private readonly options: AssumedStateOptions) {}

  observe(change: RowChange): void {
    if (
      change.table === 'commands' &&
      change.record?.status === 'succeeded' &&
      change.oldRecord?.status !== 'succeeded'
    ) {
      background(this.sent(change.record), 'ir.assumed_failed', { commandId: change.record.id });
    }
  }

  private async sent(command: CommandRow): Promise<void> {
    const at = this.options.now().toISOString();
    const matches = await this.options.store.host.write('irAssumedPress', { command, at });
    if (matches > 1) {
      this.options.log.debug('ir.assumed_ambiguous', {
        deviceId: command.device_id,
        commandId: command.id,
        matches,
      });
    }
  }
}
