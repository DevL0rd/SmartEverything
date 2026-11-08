import { describe, expect, it } from 'vitest';
import {
  GOOGLE_ACCOUNT_ROW,
  GOOGLE_CHOICE,
  GOOGLE_SYNC_LOG_ENTRY,
  GOOGLE_SYNC_STATE,
} from '../src/google-accounts';
import { GOOGLE_ENDPOINTS } from '../src/api/endpoints-google';

const PROFILE = '0b1c6a54-2f0e-4b6e-9a43-0f3b6d2b7a10';
const ITEM = '5d7b1d8e-6a43-4c1c-8d1f-2a9b3c4d5e6f';
const LOG = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const row = {
  profile_id: PROFILE,
  email: 'person@example.com',
  scopes: ['openid', 'email'],
  status: 'linked',
  problem: null,
  calendar_ids: ['primary'],
  list_ids: [],
  last_sync_at: '2026-11-07T10:00:00+00:00',
  last_error: null,
};

const candidates = [
  { google_id: 'a', title: 'Buy milk', created_at: '2026-11-07T09:00:00+00:00' },
  { google_id: 'b', title: 'Buy milk', created_at: '2026-11-07T09:00:01+00:00' },
];

const choice = {
  item_id: ITEM,
  list_id: 'list',
  candidates,
  resolved_google_id: null,
  resolved_at: null,
};

describe('Google account row', () => {
  it('accepts a linked row and the four provider words', () => {
    expect(GOOGLE_ACCOUNT_ROW.safeParse(row).success).toBe(true);
    for (const status of ['unlinked', 'linking', 'needs_attention']) {
      expect(GOOGLE_ACCOUNT_ROW.safeParse({ ...row, status }).success).toBe(true);
    }
    expect(GOOGLE_ACCOUNT_ROW.safeParse({ ...row, status: 'broken' }).success).toBe(false);
  });

  it('rejects any token or secret field', () => {
    for (const field of ['refresh_token', 'access_token', 'token', 'secret_ref', 'client_secret']) {
      expect(GOOGLE_ACCOUNT_ROW.safeParse({ ...row, [field]: 'x' }).success).toBe(false);
    }
  });
});

describe('Google sync log and state', () => {
  const entry = {
    id: LOG,
    profile_id: PROFILE,
    at: '2026-11-07T10:00:00+00:00',
    trigger: 'push',
    product: 'tasks',
    counts: { pulled: 1, created: 0, updated: 1, deleted: 0, pushed: 0, conflicts: 1 },
    conflicts: [{ item_id: ITEM, field: 'title', winner: 'google', losing_value: 'Old title' }],
    error: null,
    choice: null,
  };

  it('keeps the losing value of a conflict', () => {
    const parsed = GOOGLE_SYNC_LOG_ENTRY.parse(entry);
    expect(parsed.conflicts[0]?.losing_value).toBe('Old title');
  });

  it('needs two candidates and a resolved task that is one of them', () => {
    expect(GOOGLE_CHOICE.safeParse(choice).success).toBe(true);
    expect(GOOGLE_CHOICE.safeParse({ ...choice, candidates: candidates.slice(0, 1) }).success).toBe(
      false,
    );
    const resolved = { resolved_google_id: 'b', resolved_at: '2026-11-07T10:05:00+00:00' };
    expect(GOOGLE_CHOICE.safeParse({ ...choice, ...resolved }).success).toBe(true);
    expect(GOOGLE_CHOICE.safeParse({ ...choice, resolved_google_id: 'b' }).success).toBe(false);
    expect(
      GOOGLE_CHOICE.safeParse({ ...choice, ...resolved, resolved_google_id: 'zzz' }).success,
    ).toBe(false);
  });

  it('describes a sync state with a cursor and a channel', () => {
    const state = {
      profile_id: PROFILE,
      product: 'calendar',
      resource_id: 'primary',
      sync_token: 'cursor',
      channel: { channel_id: 'c1', resource_id: 'r1', expires_at: '2026-11-14T10:00:00+00:00' },
      last_pull_at: null,
    };
    expect(GOOGLE_SYNC_STATE.safeParse(state).success).toBe(true);
    expect(GOOGLE_SYNC_STATE.safeParse({ ...state, token: 'x' }).success).toBe(false);
  });
});

describe('Google endpoint contracts', () => {
  it('lists every path with its method and the owner-only app entry', () => {
    const lines = Object.values(GOOGLE_ENDPOINTS).map((e) => `${e.method} ${e.path} ${e.access}`);
    expect(lines).toEqual([
      'POST /api/google/link/start member',
      'POST /api/google/link/finish member',
      'DELETE /api/google/link member',
      'POST /api/google/sync member',
      'GET /api/google/sync-log member',
      'PUT /api/google/app owner',
      'PATCH /api/google/account member',
      'POST /api/google/choice member',
      'POST /api/google/push/:channelId public',
    ]);
  });

  it('validates the link start and the choice bodies strictly', () => {
    const start = GOOGLE_ENDPOINTS.googleLinkStart.body;
    const body = {
      platform: 'android',
      redirectUri: 'com.devl0rd.smarteverything.dev:/oauth',
      products: [{ product: 'calendar', readOnly: false }],
    };
    expect(start.safeParse(body).success).toBe(true);
    expect(start.safeParse({ ...body, platform: 'web' }).success).toBe(false);
    expect(start.safeParse({ ...body, products: [] }).success).toBe(false);
    const pick = GOOGLE_ENDPOINTS.googleChoice.body;
    expect(pick.safeParse({ logId: LOG, googleId: 'a' }).success).toBe(true);
    expect(pick.safeParse({ logId: LOG }).success).toBe(false);
  });
});
