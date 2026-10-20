import type { JsonValue } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { CommandExecutor } from '../../commands/executor';
import type { Store } from '../../store/store';
import type { NodeMemory } from './node-memory';
import type { PersistentVariables } from './variables';
import type { PresenceSource } from './presence';
import type { RandomPort } from './random';
import type { SignalReads } from './integration-reads';

export interface WorldReadDeps {
  readonly store: Store;
  readonly executor: Pick<CommandExecutor, 'intendedValue'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly observed: (deviceId: string, capability: string) => JsonValue | undefined;
  readonly presence: PresenceSource;
  readonly persistent: PersistentVariables;
  readonly random: RandomPort;
  readonly memory: NodeMemory;
  readonly signals: SignalReads;
}
