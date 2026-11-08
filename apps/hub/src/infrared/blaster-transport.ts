import { ApiError, type CommandRow } from '@smarteverything/domain';
import type { Clock } from '../clock';
import { COMMAND_WAIT_MS } from '../commands/command-budgets';
import { submitAndWait } from '../extensions/mcp/command-waiter';
import type { NewCommand } from '../store/repositories/commands';
import type { Store } from '../store/store';
import type { IrTransport } from './appliance-service';
import type { IrFrame } from './encoders';

export interface BlasterTransportOptions {
  readonly store: Pick<Store, 'feed' | 'commands'>;
  readonly clock: Clock;
  readonly submit: (commands: readonly NewCommand[]) => readonly CommandRow[];
}

function failureOf(frame: IrFrame, command: CommandRow | undefined, finished: boolean): ApiError {
  if (!finished || command === undefined) {
    return new ApiError(
      'upstream_failed',
      `The blaster did not finish sending ${frame.key}; check command history before trying again.`,
    );
  }
  return new ApiError(
    'upstream_failed',
    command.error ?? `The blaster ${command.status} sending ${frame.key}.`,
  );
}

export function blasterTransport(options: BlasterTransportOptions): IrTransport {
  return {
    send: async (blasterId, frame): Promise<void> => {
      const outcome = await submitAndWait({
        feed: options.store.feed,
        clock: options.clock,
        waitMs: COMMAND_WAIT_MS,
        submit: (): Promise<readonly CommandRow[]> =>
          Promise.resolve(
            options.submit([
              {
                deviceId: blasterId,
                capability: 'ir_send',
                value: { format: frame.format, code: frame.code },
                source: 'automation',
                requestedBy: null,
              },
            ]),
          ),
        current: (id) => options.store.commands.byId(id),
      });
      const [command] = outcome.commands;
      if (!outcome.allFinished || command?.status !== 'succeeded') {
        throw failureOf(frame, command, outcome.allFinished);
      }
    },
  };
}
