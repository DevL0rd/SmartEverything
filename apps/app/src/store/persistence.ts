import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import {
  ASSISTANT_MESSAGES_SNAPSHOT,
  SNAPSHOT,
  type Snapshot,
  type StateRow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { jsonText } from '../format/json-text';
import type { EntityStore } from './entity-store';
import { rowsOf, type StoreState } from './state';

const log = new Logger('app.persistence');

const IDLE_MS = 2000;
const AT_MOST_EVERY_MS = 10_000;

function hashOf(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

const SCHEMA_HASH = hashOf(
  JSON.stringify(z.toJSONSchema(SNAPSHOT, { unrepresentable: 'any', io: 'input' })),
);

const PERSISTED = z.strictObject({ schema: z.literal(SCHEMA_HASH), snapshot: SNAPSHOT });

function keyOf(serverUrl: string): string {
  return `smarteverything.snapshot.${hashOf(serverUrl)}`;
}

function stateRows(state: StoreState): StateRow[] {
  return Object.entries(state.deviceValues).flatMap(([device_id, values]) =>
    Object.entries(values).map(([capability, reading]) => ({
      device_id,
      capability,
      value: reading.value,
      observed_at: reading.observedAt,
    })),
  );
}

function snapshotOf(state: StoreState): Snapshot | null {
  const { settings, session, firewall, sync } = state;
  if (settings === null || session === null || firewall === null || sync.seq === null) {
    return null;
  }
  const t = state.tables;
  const owner = session.client.role === 'owner';
  return {
    seq: sync.seq,
    session,
    firewall,
    tables: {
      settings,
      rooms: [...rowsOf(t.rooms)],
      devices: rowsOf(t.devices).map(({ label: _label, ...row }) => row),
      device_state: stateRows(state),
      cameras: [...rowsOf(t.cameras)],
      scenes: [...rowsOf(t.scenes)],
      automations: [...rowsOf(t.automations)],
      provider_links: [...rowsOf(t.provider_links)],
      ir_remotes: [...rowsOf(t.ir_remotes)],
      ir_codes: [...rowsOf(t.ir_codes)],
      layouts: [...rowsOf(t.layouts)],
      events: [...rowsOf(t.events)],
      commands: [...rowsOf(t.commands)],
      recordings: [...rowsOf(t.recordings)],
      health_sources: [...rowsOf(t.health_sources)],
      health_daily: [...rowsOf(t.health_daily)],
      profiles: [...rowsOf(t.profiles)],
      body_readings: [...rowsOf(t.body_readings)],
      ...(state.weather === null ? {} : { weather: state.weather }),
      talk_channels: [...rowsOf(t.talk_channels)],
      talk_members: [...rowsOf(t.talk_members)],
      talk_messages: [...rowsOf(t.talk_messages)],
      assistant_messages: rowsOf(t.assistant_messages).slice(0, ASSISTANT_MESSAGES_SNAPSHOT),
      scheduled_actions: [...rowsOf(t.scheduled_actions)],
      ...(state.assistant === null ? {} : { assistant_status: state.assistant }),
      ai_chats: [...rowsOf(t.ai_chats)],
    },
    owner: owner
      ? {
          clients: [...rowsOf(t.clients)],
          push_targets: [...rowsOf(t.push_targets)],
          mcp_tokens: [...rowsOf(t.mcp_tokens)],
          oauth_clients: [...rowsOf(t.oauth_clients)],
        }
      : null,
  };
}

export async function restoreSnapshot(serverUrl: string, store: EntityStore): Promise<void> {
  const text = await AsyncStorage.getItem(keyOf(serverUrl));
  if (text === null) {
    return;
  }
  const read = jsonText(text);
  const parsed = read.ok ? PERSISTED.safeParse(read.value) : null;
  if (parsed?.success !== true) {
    log.info('snapshot.discarded', { reason: 'schema changed or unreadable' });
    await AsyncStorage.removeItem(keyOf(serverUrl));
    return;
  }
  if (!store.get().loaded) {
    store.replace(parsed.data.snapshot);
  }
}

export function persistSnapshots(serverUrl: string, store: EntityStore): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWrite = 0;
  const write = (): void => {
    timer = null;
    lastWrite = Date.now();
    const snapshot = snapshotOf(store.get());
    if (snapshot === null) {
      return;
    }
    AsyncStorage.setItem(keyOf(serverUrl), JSON.stringify({ schema: SCHEMA_HASH, snapshot })).catch(
      (error: unknown) => {
        log.warn('snapshot.not_saved', { reason: String(error) });
      },
    );
  };
  const unsubscribe = store.subscribe(() => {
    if (timer !== null) {
      return;
    }
    const wait = Math.max(IDLE_MS, lastWrite + AT_MOST_EVERY_MS - Date.now());
    timer = setTimeout(write, wait);
  });
  return (): void => {
    unsubscribe();
    if (timer !== null) {
      clearTimeout(timer);
    }
  };
}
