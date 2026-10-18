import type {
  CommandRow,
  CommandSource,
  CommandStatus,
  DiscoveredDevice,
  HubCommand,
  JsonValue,
} from '@smarteverything/domain';
import { CommandExecutor } from '../../src/commands/executor';
import { DeviceDriverRegistry } from '../../src/local/device-driver';
import { Inventory } from '../../src/state/inventory';
import { testDatabase, type TestDatabase } from './database';
import { FakeAdapter, LAMP } from './fake-provider';
import { testLogger } from './logs';

export const NOW = new Date('2026-10-08T12:00:00.000Z');

interface Setup {
  db: TestDatabase;
  commands: Commands;
  adapter: GatedAdapter;
  executor: CommandExecutor;
  lampId: string;
  hubCommands: HubCommand[];
  running: { value: boolean };
}

interface NewRow {
  readonly device_id?: string;
  readonly capability: string;
  readonly value?: JsonValue;
  readonly source?: CommandSource;
  readonly status?: Extract<CommandStatus, 'running' | 'succeeded'>;
  readonly createdAt?: Date;
}

interface Commands {
  readonly add: (row: NewRow) => CommandRow;
  readonly get: (id: string) => CommandRow;
}

const open: TestDatabase[] = [];

export async function closeSetups(): Promise<void> {
  await Promise.all(open.splice(0).map((db) => db.close()));
}

function commandsOf(db: TestDatabase): Commands {
  return {
    add: (row): CommandRow => {
      db.setNow(row.createdAt ?? NOW);
      const [inserted] = db.store.commands.insert([
        {
          deviceId: row.device_id ?? null,
          capability: row.capability,
          value: row.value ?? null,
          source: row.source ?? 'app',
          requestedBy: null,
        },
      ]);
      db.setNow(NOW);
      if (inserted === undefined) throw new Error('command not inserted');
      if (row.status === undefined) return inserted;
      db.store.commands.claim(inserted.id, 'pending');
      if (row.status === 'running') return db.store.commands.byId(inserted.id);
      return db.store.commands.finish(inserted.id, { status: 'succeeded', result: null });
    },
    get: (id): CommandRow => db.store.commands.byId(id),
  };
}

const BUTTON_LAMP: DiscoveredDevice = {
  ...LAMP,
  capabilities: [
    ...LAMP.capabilities,
    { key: 'filter_reset', label: 'Reset filter', access: 'write', value: { kind: 'action' } },
    {
      key: 'remote_key',
      label: 'Remote button',
      access: 'write',
      value: { kind: 'enum', options: ['UP', 'DOWN', 'OK'] },
    },
  ],
};

class GatedAdapter extends FakeAdapter {
  gating = false;
  private readonly gates: (() => void)[] = [];

  constructor() {
    super();
    const immediate = this.execute;
    this.execute = (command): Promise<JsonValue> => {
      if (!this.gating) return immediate(command);
      this.executed.push(command);
      return new Promise((resolve) => {
        this.gates.push(() => {
          resolve(null);
        });
      });
    };
  }

  release(): void {
    this.gates.shift()?.();
  }
}

export async function setup(
  hubReply: () => Promise<JsonValue> = () => Promise.resolve({ ok: true }),
  gated = false,
): Promise<Setup> {
  const db = await testDatabase(NOW);
  open.push(db);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
  });
  await inventory.apply('xiaomi', [BUTTON_LAMP]);
  const adapter = new GatedAdapter();
  adapter.gating = gated;
  const running = { value: true };
  const hubCommands: HubCommand[] = [];
  const executor = new CommandExecutor({
    store: db.database,
    inventory,
    drivers: new DeviceDriverRegistry(),
    adapters: { adapterFor: (): GatedAdapter | undefined => (running.value ? adapter : undefined) },
    hubCommand: (command): Promise<JsonValue> => {
      hubCommands.push(command);
      return hubReply();
    },
    log: testLogger(),
    now: (): Date => NOW,
  });
  return {
    db,
    commands: commandsOf(db),
    adapter,
    executor,
    lampId: inventory.deviceOf('xiaomi', 'lamp-1')?.id ?? '',
    hubCommands,
    running,
  };
}
