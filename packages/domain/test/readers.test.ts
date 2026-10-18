import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { OWNER_SNAPSHOT_TABLES, SNAPSHOT_ENDPOINTS, SNAPSHOT_TABLES } from '../src/api/snapshot';
import { MCP_TOKEN_ROW } from '../src/api/rows-access';
import { EVENT_ROW, ROOM_ROW, STATE_ROW } from '../src/api/rows-home';
import { PUSH_TARGET_ROW, RECORDING_ROW } from '../src/api/rows-media';
import { ENTRY_FAILURE, BLE_ADVERT_BATCH, HEALTH_OUTBOX_ACK } from '../src/body-readings';
import { HEALTH_INGEST_RESULT } from '../src/health';
import { NODE_FRAME, HUB_FRAME } from '../src/node/frames';
import { NODE_REPORT } from '../src/node/report';
import { PHONE_ACTION, PHONE_REPORT } from '../src/phones';
import { INBOUND_MESSAGE, PLUGIN_SEARCH_ENTRY, PLUGIN_STREAM_ROW } from '../src/plugins';
import {
  AI_OUTREACH_ROW,
  AI_SPEECH_NOTICE,
  REACH_SETTINGS,
  REACH_SETTINGS_CHANGE,
} from '../src/reach';
import { ROBOT_ACTIVITY, ROBOT_MOVES, ROBOT_STATUS } from '../src/robot';
import { FOLDER_TYPES, SYNCTHING_SNAPSHOT, SYNC_PAUSE_COMMAND } from '../src/syncthing';
import { TALK_CLIENT_MESSAGE, TALK_SERVER_MESSAGE } from '../src/talk-protocol';
import { WATCH_DAYS, WATCH_RECORDS, WATCH_STATE } from '../src/watches';

const ID = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const AT = '2026-10-08T07:00:00Z';
const LONG = 'x'.repeat(20_000);

function strips(schema: z.ZodType, value: Readonly<Record<string, unknown>>): void {
  const parsed = schema.parse({ ...value, added: 1 });
  expect(parsed).not.toHaveProperty('added');
  expect(parsed).toStrictEqual(schema.parse(value));
}

function many<T>(count: number, item: T): readonly T[] {
  return Array.from({ length: count }, () => item);
}

const ROWS: readonly (readonly [string, z.ZodType, Readonly<Record<string, unknown>>])[] = [
  ['ROOM_ROW', ROOM_ROW, { id: ID, name: 'Kitchen', position: 0 }],
  [
    'EVENT_ROW',
    EVENT_ROW,
    {
      id: ID,
      device_id: null,
      kind: 'motion',
      occurred_at: AT,
      details: {},
      acknowledged_at: null,
      created_at: AT,
    },
  ],
  ['STATE_ROW', STATE_ROW, { device_id: ID, capability: 'on', value: true, observed_at: AT }],
  [
    'RECORDING_ROW',
    RECORDING_ROW,
    {
      id: ID,
      device_id: OTHER,
      event_id: null,
      kind: 'clip',
      storage_path: 'a/b.mp4',
      started_at: AT,
      duration_ms: null,
      bytes: 1,
      created_at: AT,
    },
  ],
  [
    'PUSH_TARGET_ROW',
    PUSH_TARGET_ROW,
    { token: 't', client_id: ID, platform: 'android', created_at: AT },
  ],
  [
    'MCP_TOKEN_ROW',
    MCP_TOKEN_ROW,
    { id: ID, name: 'Agent', created_at: AT, last_used_at: null, revoked_at: null },
  ],
  [
    'PLUGIN_STREAM_ROW',
    PLUGIN_STREAM_ROW,
    { plugin_id: 'weather', stream: 'status', value: 1, at: AT },
  ],
];

describe('rows and snapshots ignore fields they do not know', () => {
  it.each(ROWS)('%s drops an added column', (_name, schema, row) => {
    strips(schema, row);
  });

  it('reads more event rows than the window the hub sends', () => {
    const event = ROWS[1]?.[2];
    expect(SNAPSHOT_TABLES.shape.events.parse(many(500, event))).toHaveLength(500);
  });

  it('drops an added table from the owner tables', () => {
    strips(OWNER_SNAPSHOT_TABLES, {
      clients: [],
      push_targets: [],
      mcp_tokens: [],
      oauth_clients: [],
    });
  });

  it('keeps the snapshot query strict', () => {
    const { query } = SNAPSHOT_ENDPOINTS.readSnapshot;
    expect(query.safeParse({ unknownFlag: 'true' }).success).toBe(false);
  });
});

describe('reports and frames ignore fields they do not know', () => {
  const report = { at: AT, values: {}, events: [] };

  it('reads a node report and a node frame', () => {
    strips(NODE_REPORT, report);
    strips(NODE_FRAME, { type: 'report', report });
    strips(HUB_FRAME, { type: 'demand', demand: { topics: { summary: 1000 } } });
  });

  it('reads a phone report with a long track name and many events', () => {
    const event = { kind: 'phone_unlocked', at: AT, details: {} };
    const parsed = PHONE_REPORT.parse({
      ...report,
      added: 1,
      values: { now_playing: LONG, added: 1 },
      events: many(200, { ...event, added: 1 }),
    });
    expect(parsed).not.toHaveProperty('added');
    expect(parsed.values.now_playing).toBe(LONG);
    expect(parsed.events).toHaveLength(200);
  });

  it('reads talk messages with a long detail', () => {
    strips(TALK_CLIENT_MESSAGE, { type: 'release' });
    const ended = { type: 'ended', messageId: ID, reason: 'failed', detail: LONG };
    strips(TALK_SERVER_MESSAGE, ended);
    expect(TALK_SERVER_MESSAGE.parse(ended)).toStrictEqual(ended);
  });
});

describe('watch, health and body data ignore fields they do not know', () => {
  const state = {
    phase: 'paused',
    battery: null,
    charging: null,
    worn: null,
    firmware: LONG,
    steps: null,
    heartRate: null,
    lastSyncAt: null,
    error: LONG,
    at: AT,
  };

  it('reads a watch state with long text', () => {
    strips(WATCH_STATE, state);
    expect(WATCH_STATE.parse(state).error).toBe(LONG);
  });

  it('reads watch records with more sample batches than a sender sends', () => {
    const batch = { kind: 'stress', zoneOffsetSeconds: 0, samples: [{ time: AT, value: 3 }] };
    const parsed = WATCH_RECORDS.parse({ records: [], samples: many(80, batch), added: 1 });
    expect(parsed).not.toHaveProperty('added');
    expect(parsed.samples).toHaveLength(80);
    strips(WATCH_DAYS, { days: [] });
  });

  it('reads an outbox acknowledgement with long lists and reasons', () => {
    const written = { id: ID, version: 1 };
    const parsed = HEALTH_OUTBOX_ACK.parse({
      written: many(300, written),
      failed: [{ id: ID, version: 1, reason: LONG, added: 1 }],
      added: 1,
    });
    expect(parsed).not.toHaveProperty('added');
    expect(parsed.written).toHaveLength(300);
    expect(parsed.failed[0]?.reason).toBe(LONG);
    strips(ENTRY_FAILURE, { id: ID, version: 1, reason: 'why' });
  });

  it('reads a batch of adverts larger than the one a phone sends', () => {
    const advert = {
      address: 'AA:BB:CC:DD:EE:FF',
      serviceUuid: '0000fe95-0000-1000-8000-00805f9b34fb',
      data: '0102030405',
      rssi: null,
      seenAt: AT,
    };
    expect(BLE_ADVERT_BATCH.parse({ adverts: many(120, advert) }).adverts).toHaveLength(120);
  });

  it('reads an ingest result with an added field', () => {
    strips(HEALTH_INGEST_RESULT, { stored: 1, stale: 0, deleted: 0, days: [] });
  });
});

describe('plugin, robot, sync and reach data ignore fields they do not know', () => {
  it('reads an inbound plugin message with long text and many attachments', () => {
    const attachment = {
      name: 'a',
      mime: 'text/plain',
      source: { kind: 'url', url: 'https://example.com/a' },
      added: 1,
    };
    const message = {
      eventId: 'e',
      conversation: { key: 'k', title: 'T' },
      text: LONG,
      from: { id: 'u', name: 'N', added: 1 },
      attachments: many(25, attachment),
      reply: { tool: 'send', added: 1 },
      added: 1,
    };
    const parsed = INBOUND_MESSAGE.parse(message);
    expect(parsed).not.toHaveProperty('added');
    expect(parsed.text).toBe(LONG);
    expect(parsed.attachments).toHaveLength(25);
  });

  it('reads a plugin search entry with a long subtitle', () => {
    const entry = {
      id: 'i',
      title: 'T',
      subtitle: LONG,
      target: { kind: 'path', path: '/devices' },
    };
    expect(PLUGIN_SEARCH_ENTRY.parse({ ...entry, added: 1 }).subtitle).toBe(LONG);
  });

  it('reads robot status, activity and moves past their former limits', () => {
    const listener = { state: 'off', reason: LONG };
    const status = {
      mode: 'local',
      address: LONG,
      server: listener,
      dns: listener,
      ports: { http: 1, https: 2, dns: 3 },
      contact: null,
      calls: many(40, { path: LONG, count: 1, last: AT }),
      robot: null,
      conversation: false,
      waiting: 0,
      tasks: 0,
      configured: true,
      capture: false,
      lines: many(30, { at: AT, who: 'user', text: LONG }),
      updatedAt: AT,
    };
    expect(ROBOT_STATUS.parse({ ...status, added: 1 }).lines).toHaveLength(30);
    const entry = { id: 1, at: AT, kind: 'heard', title: LONG, detail: LONG };
    expect(ROBOT_ACTIVITY.parse({ entries: many(90, entry) }).entries).toHaveLength(90);
    const move = { id: 'm', description: LONG, instructions: LONG, options: [] };
    expect(ROBOT_MOVES.parse({ actions: many(500, move), animations: 1 }).actions).toHaveLength(
      500,
    );
  });

  it('reads a syncthing snapshot with every folder error', () => {
    const folder = {
      id: LONG,
      label: 'L',
      path: '/p',
      type: FOLDER_TYPES[0],
      paused: false,
      state: 'idle',
      completionPercent: 100,
      needBytes: 0,
      needItems: 0,
      localChanges: 0,
      errors: many(60, { path: '/p', error: 'e', added: 1 }),
      errorCount: 60,
      stateError: null,
      sharedWith: [],
      lastScan: null,
      lastFile: null,
    };
    const snapshot = {
      at: AT,
      connection: { state: 'online' },
      version: null,
      myId: null,
      uptimeSeconds: null,
      ratesLive: false,
      summary: {
        state: 'in_sync',
        needBytes: 0,
        foldersBehind: 0,
        peersOnline: 0,
        peersTotal: 0,
        downloadBytesPerSecond: 0,
        uploadBytesPerSecond: 0,
      },
      folders: [folder],
      peers: [],
      pendingDevices: [],
      pendingFolders: [],
      attention: [],
    };
    const parsed = SYNCTHING_SNAPSHOT.parse({ ...snapshot, added: 1 });
    expect(parsed).not.toHaveProperty('added');
    expect(parsed.folders[0]?.errors).toHaveLength(60);
  });

  it('reads outreach rows, speech notices and reach settings', () => {
    const outreach = {
      id: ID,
      profile_id: OTHER,
      chat_id: null,
      from_chat_id: null,
      how: 'phone',
      target: LONG,
      target_label: LONG,
      reason: LONG,
      urgent: false,
      state: 'sent',
      detail: LONG,
      call_id: null,
      client_id: null,
      created_at: AT,
      answered_at: null,
      ended_at: null,
      expires_at: null,
    };
    expect(AI_OUTREACH_ROW.parse({ ...outreach, added: 1 }).reason).toBe(LONG);
    const audio = 'AAAA'.repeat(500_000);
    const notice = { type: 'ai_speech', id: ID, from: LONG, text: LONG, audio };
    expect(AI_SPEECH_NOTICE.parse({ ...notice, added: 1 }).audio).toBe(audio);
    strips(REACH_SETTINGS, { quiet: null, cameras: [] });
  });
});

describe('writers stay strict', () => {
  it('refuses an owner request with a field it does not know', () => {
    expect(PHONE_ACTION.safeParse({ type: 'refresh', added: 1 }).success).toBe(false);
    const pause = { command: 'set_paused', target: { kind: 'all' }, paused: true };
    expect(SYNC_PAUSE_COMMAND.safeParse(pause).success).toBe(true);
    expect(SYNC_PAUSE_COMMAND.safeParse({ ...pause, added: 1 }).success).toBe(false);
    expect(REACH_SETTINGS_CHANGE.safeParse({ cameras: [], added: 1 }).success).toBe(false);
  });
});
