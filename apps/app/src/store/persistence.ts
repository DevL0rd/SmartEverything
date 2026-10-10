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
import { shallowEqual } from './store-context';

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

function stateRows(deviceValues: StoreState['deviceValues']): StateRow[] {
  return Object.entries(deviceValues).flatMap(([device_id, values]) =>
    Object.entries(values).map(([capability, reading]) => ({
      device_id,
      capability,
      value: reading.value,
      observed_at: reading.observedAt,
    })),
  );
}

type PersistedInputs = Pick<
  StoreState,
  'settings' | 'session' | 'firewall' | 'weather' | 'exchangeRates' | 'assistant' | 'deviceValues'
> &
  Pick<
    StoreState['tables'],
    | 'rooms'
    | 'devices'
    | 'cameras'
    | 'scenes'
    | 'automations'
    | 'provider_links'
    | 'ir_remotes'
    | 'ir_codes'
    | 'layouts'
    | 'events'
    | 'commands'
    | 'recordings'
    | 'health_sources'
    | 'health_daily'
    | 'profiles'
    | 'body_readings'
    | 'talk_channels'
    | 'talk_members'
    | 'talk_messages'
    | 'assistant_messages'
    | 'scheduled_actions'
    | 'ai_chats'
    | 'clients'
    | 'push_targets'
    | 'mcp_tokens'
    | 'oauth_clients'
  >;

function inputsOf(state: StoreState): PersistedInputs {
  const t = state.tables;
  return {
    settings: state.settings,
    session: state.session,
    firewall: state.firewall,
    weather: state.weather,
    exchangeRates: state.exchangeRates,
    assistant: state.assistant,
    deviceValues: state.deviceValues,
    rooms: t.rooms,
    devices: t.devices,
    cameras: t.cameras,
    scenes: t.scenes,
    automations: t.automations,
    provider_links: t.provider_links,
    ir_remotes: t.ir_remotes,
    ir_codes: t.ir_codes,
    layouts: t.layouts,
    events: t.events,
    commands: t.commands,
    recordings: t.recordings,
    health_sources: t.health_sources,
    health_daily: t.health_daily,
    profiles: t.profiles,
    body_readings: t.body_readings,
    talk_channels: t.talk_channels,
    talk_members: t.talk_members,
    talk_messages: t.talk_messages,
    assistant_messages: t.assistant_messages,
    scheduled_actions: t.scheduled_actions,
    ai_chats: t.ai_chats,
    clients: t.clients,
    push_targets: t.push_targets,
    mcp_tokens: t.mcp_tokens,
    oauth_clients: t.oauth_clients,
  };
}

function snapshotOf(state: StoreState, inputs: PersistedInputs): Snapshot | null {
  const { sync } = state;
  const { settings, session, firewall } = inputs;
  if (settings === null || session === null || firewall === null || sync.seq === null) {
    return null;
  }
  const owner = session.client.role === 'owner';
  return {
    seq: sync.seq,
    session,
    firewall,
    tables: {
      settings,
      rooms: [...rowsOf(inputs.rooms)],
      devices: rowsOf(inputs.devices).map(({ label: _label, ...row }) => row),
      device_state: stateRows(inputs.deviceValues),
      cameras: [...rowsOf(inputs.cameras)],
      scenes: [...rowsOf(inputs.scenes)],
      automations: [...rowsOf(inputs.automations)],
      provider_links: [...rowsOf(inputs.provider_links)],
      ir_remotes: [...rowsOf(inputs.ir_remotes)],
      ir_codes: [...rowsOf(inputs.ir_codes)],
      layouts: [...rowsOf(inputs.layouts)],
      events: [...rowsOf(inputs.events)],
      commands: [...rowsOf(inputs.commands)],
      recordings: [...rowsOf(inputs.recordings)],
      health_sources: [...rowsOf(inputs.health_sources)],
      health_daily: [...rowsOf(inputs.health_daily)],
      profiles: [...rowsOf(inputs.profiles)],
      body_readings: [...rowsOf(inputs.body_readings)],
      ...(inputs.weather === null ? {} : { weather: inputs.weather }),
      ...(inputs.exchangeRates === null ? {} : { exchange_rates: inputs.exchangeRates }),
      talk_channels: [...rowsOf(inputs.talk_channels)],
      talk_members: [...rowsOf(inputs.talk_members)],
      talk_messages: [...rowsOf(inputs.talk_messages)],
      assistant_messages: rowsOf(inputs.assistant_messages).slice(0, ASSISTANT_MESSAGES_SNAPSHOT),
      scheduled_actions: [...rowsOf(inputs.scheduled_actions)],
      ...(inputs.assistant === null ? {} : { assistant_status: inputs.assistant }),
      ai_chats: [...rowsOf(inputs.ai_chats)],
    },
    owner: owner
      ? {
          clients: [...rowsOf(inputs.clients)],
          push_targets: [...rowsOf(inputs.push_targets)],
          mcp_tokens: [...rowsOf(inputs.mcp_tokens)],
          oauth_clients: [...rowsOf(inputs.oauth_clients)],
        }
      : null,
  };
}

function persistedParts(inputs: PersistedInputs): readonly unknown[] {
  return Object.values(inputs);
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
  let written: readonly unknown[] | null = null;
  const write = (): void => {
    timer = null;
    lastWrite = Date.now();
    const state = store.get();
    const inputs = inputsOf(state);
    written = persistedParts(inputs);
    const snapshot = snapshotOf(state, inputs);
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
    if (
      timer !== null ||
      (written !== null && shallowEqual(written, persistedParts(inputsOf(store.get()))))
    ) {
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
