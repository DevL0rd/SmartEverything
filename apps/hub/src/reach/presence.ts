import type {
  ClientRow,
  DeviceRow,
  PhoneContext,
  ReachPresence,
  SignalInput,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { ReachRules } from './reach-rules';
import type { PresenceDevice } from './reach-units';

type Room = NonNullable<ReachPresence['lastActivityInHome']>;

const MINUTE_MS = 60_000;

export type PresenceStore = Pick<Store, 'host' | 'live'>;

export interface PresenceSources {
  readonly store: PresenceStore;
  readonly rules: ReachRules;
  readonly online: () => ReadonlySet<string>;
  readonly seen: () => readonly SignalInput[];
  readonly phone: (personId: string, viewerId: string) => Promise<PhoneContext>;
  readonly now: () => Date;
}

export function clientsOf(store: Pick<Store, 'host'>, personId: string): Promise<ClientRow[]> {
  return store.host.read('reachClients', personId);
}

export function deviceName(device: DeviceRow): string {
  return device.display_name ?? device.name;
}

function lastActivity(
  sources: PresenceSources,
  seen: readonly SignalInput[],
  devices: ReadonlyMap<string, PresenceDevice>,
): Room | null {
  for (const signal of seen) {
    const device = signal.subject === null ? undefined : devices.get(signal.subject);
    if (device !== undefined && (signal.kind === 'person' || signal.kind === 'motion')) {
      return {
        deviceId: device.id,
        device: device.name,
        room: device.room,
        seen: signal.kind,
        at: signal.at,
        minutesAgo: Math.max(
          0,
          Math.floor((sources.now().getTime() - Date.parse(signal.at)) / MINUTE_MS),
        ),
      };
    }
  }
  return null;
}

export async function presenceOf(
  sources: PresenceSources,
  personId: string,
  viewerId: string,
): Promise<ReachPresence> {
  const { store, rules } = sources;
  const online = sources.online();
  const seen = sources.seen();
  const cameras = rules.cameras();
  const subjects = seen.flatMap((signal) => (signal.subject === null ? [] : [signal.subject]));
  const [rows, phone] = await Promise.all([
    store.host.read('reachPresence', { personId, devices: [...cameras, ...subjects] }),
    sources.phone(personId, viewerId),
  ]);
  const devices = new Map(rows.devices.map((device) => [device.id, device]));
  return {
    personId,
    name: rows.name,
    quietNow: rules.quietNow(personId),
    quiet: rules.quiet(personId),
    apps: rows.clients.map((client) => ({
      clientId: client.id,
      name: client.name,
      platform: client.platform,
      connected: online.has(client.id),
      lastSeenAt: client.last_seen_at,
    })),
    phone: phone.deviceId === null ? null : phone,
    lastActivityInHome: lastActivity(sources, seen, devices),
    cameras: cameras.flatMap((id) => {
      const device = devices.get(id);
      return device === undefined ? [] : [device];
    }),
    channels: rows.channels,
    open: [...rows.open],
  };
}
