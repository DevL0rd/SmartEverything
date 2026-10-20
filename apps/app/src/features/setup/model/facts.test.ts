import { describe, expect, it } from 'vitest';
import {
  CLIENT_ROW,
  FIREWALL_STATUS,
  MCP_TOKEN_ROW,
  OAUTH_CLIENT_ROW,
  PROFILE_ROW,
  PROVIDER_LINK_ROW,
  SESSION,
  SETTINGS_ROW,
  UNSET_FITNESS_GOALS,
  type ClientRow,
  type FirewallStatus,
  type McpTokenRow,
  type OAuthClientRow,
  type ProfileRow,
  type ProviderLinkRow,
  type SettingsRow,
} from '@smarteverything/domain';
import { deviceFixture } from '../../../store/device-fixture';
import {
  emptyState,
  makeTable,
  type Device,
  type Session,
  type StoreState,
  type Table,
} from '../../../store/state';
import { storeFactsOf } from './facts';

const MOMENT = '2026-10-16T08:00:00.000Z';
const ID = (n: number): string => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

function profile(n: number, name: string, over: Record<string, unknown> = {}): ProfileRow {
  return PROFILE_ROW.parse({
    id: ID(n),
    name,
    colour: 'aqua',
    sex: null,
    birth_date: null,
    height_cm: null,
    scale_user: null,
    fitness_goals: UNSET_FITNESS_GOALS,
    max_heart_rate: null,
    position: n,
    created_at: MOMENT,
    updated_at: MOMENT,
    ...over,
  });
}

function client(n: number, over: Record<string, unknown> = {}): ClientRow {
  return CLIENT_ROW.parse({
    id: ID(n),
    name: `Client ${String(n)}`,
    platform: 'web',
    role: 'owner',
    built_in: false,
    profile_id: null,
    created_at: MOMENT,
    last_seen_at: null,
    ...over,
  });
}

function settings(over: Record<string, unknown> = {}): SettingsRow {
  return SETTINGS_ROW.parse({
    home_name: 'Home',
    time_zone: 'UTC',
    latitude: null,
    longitude: null,
    public_url: null,
    public_url_checked_at: null,
    public_url_verified_at: null,
    public_url_error: null,
    ice_servers: [],
    webrtc_candidates: [],
    push_project_id: null,
    updated_at: MOMENT,
    ...over,
  });
}

function link(status: string): ProviderLinkRow {
  return PROVIDER_LINK_ROW.parse({
    provider: 'xiaomi',
    account_label: null,
    status,
    prompt: null,
    last_error: null,
    device_count: 0,
    updated_at: MOMENT,
  });
}

function token(n: number, revoked: boolean): McpTokenRow {
  return MCP_TOKEN_ROW.parse({
    id: ID(n),
    name: `Token ${String(n)}`,
    created_at: MOMENT,
    last_used_at: null,
    revoked_at: revoked ? MOMENT : null,
  });
}

function tableOf<R extends { readonly id: string }>(rows: readonly R[]): Table<R> {
  return makeTable(
    Object.fromEntries(rows.map((row) => [row.id, row])),
    rows.map((row) => row.id),
    1,
  );
}

function firewall(
  backend: string,
  openings: readonly string[],
  lowPorts: string | null,
): FirewallStatus {
  return FIREWALL_STATUS.parse({
    checkedAt: MOMENT,
    backend,
    filtering: true,
    detail: 'detail',
    openings: openings.map((state, index) => ({
      id: `opening-${String(index)}`,
      deviceIds: [],
      rule: { purpose: 'webrtc', protocol: 'udp', port: 50_000 + index },
      state,
    })),
    plan: null,
    cameras: [],
    lowPorts: lowPorts === null ? null : { start: 1024, state: lowPorts },
  });
}

interface Parts {
  readonly settings?: SettingsRow | null;
  readonly profiles?: readonly ProfileRow[];
  readonly clients?: readonly ClientRow[];
  readonly devices?: readonly Device[];
  readonly links?: readonly ProviderLinkRow[];
  readonly tokens?: readonly McpTokenRow[];
  readonly oauth?: readonly string[];
  readonly firewall?: StoreState['firewall'];
  readonly role?: 'owner' | 'member' | null;
  readonly profileId?: string | null;
}

function oauthClient(id: string): OAuthClientRow {
  return OAUTH_CLIENT_ROW.parse({
    id,
    name: id,
    uri: null,
    logo_uri: null,
    redirect_uris: ['https://example.com/callback'],
    scopes: [],
    created_at: MOMENT,
    granted_at: null,
    revoked_at: null,
  });
}

function sessionOf(role: 'owner' | 'member' | null, profileId: string | null): Session | null {
  if (role === null) return null;
  return SESSION.parse({
    client: client(90, { role, profile_id: profileId }),
    hub: { version: '1', startedAt: MOMENT, cameras: 'running' },
  });
}

function linkTable(rows: readonly ProviderLinkRow[]): Table<ProviderLinkRow> {
  const ids = rows.map((_, index) => String(index));
  return makeTable(Object.fromEntries(rows.map((row, index) => [String(index), row])), ids, 1);
}

function stateWith(given: Parts): StoreState {
  const parts = {
    settings: settings(),
    firewall: null,
    role: 'owner',
    profileId: null,
    profiles: [],
    clients: [],
    devices: [],
    links: [],
    tokens: [],
    oauth: [],
    ...given,
  } satisfies Parts;
  const base = emptyState();
  return {
    ...base,
    settings: parts.settings,
    firewall: parts.firewall,
    session: sessionOf(parts.role, parts.profileId),
    tables: {
      ...base.tables,
      profiles: tableOf(parts.profiles),
      clients: tableOf(parts.clients),
      devices: tableOf(parts.devices),
      provider_links: linkTable(parts.links),
      mcp_tokens: tableOf(parts.tokens),
      oauth_clients: tableOf(parts.oauth.map(oauthClient)),
    },
  };
}

describe('the setup facts read from the store', () => {
  it('knows the owner from the session role and a member or no session as not the owner', () => {
    expect(storeFactsOf(stateWith({ role: 'owner' })).owner).toBe(true);
    expect(storeFactsOf(stateWith({ role: 'member' })).owner).toBe(false);
    expect(storeFactsOf(stateWith({ role: null })).owner).toBe(false);
  });

  it('has not checked the firewall until the server answers', () => {
    expect(storeFactsOf(stateWith({})).firewall).toBe('unchecked');
  });

  it('reports no firewall when the backend is none', () => {
    expect(storeFactsOf(stateWith({ firewall: firewall('none', [], null) })).firewall).toBe('none');
  });

  it('calls the firewall open when every opening and the low ports are open', () => {
    const facts = storeFactsOf(
      stateWith({ firewall: firewall('ufw', ['open', 'unknown'], 'open') }),
    );
    expect(facts.firewall).toBe('open');
  });

  it('calls the firewall missing for a missing or denied opening', () => {
    expect(
      storeFactsOf(stateWith({ firewall: firewall('ufw', ['open', 'missing'], null) })).firewall,
    ).toBe('missing');
    expect(storeFactsOf(stateWith({ firewall: firewall('ufw', ['denied'], null) })).firewall).toBe(
      'missing',
    );
  });

  it('calls the firewall missing when only the low ports are missing', () => {
    expect(
      storeFactsOf(stateWith({ firewall: firewall('ufw', ['open'], 'missing') })).firewall,
    ).toBe('missing');
  });

  it('tells apart no address, an unchecked one, a failing one and a verified one', () => {
    const address = (over: Record<string, unknown>): string =>
      storeFactsOf(stateWith({ settings: settings(over) })).address;
    const url = { public_url: 'https://home.example.com' };
    expect(address({})).toBe('none');
    expect(address(url)).toBe('unverified');
    expect(address({ ...url, public_url_error: 'timeout' })).toBe('failing');
    expect(address({ ...url, public_url_verified_at: MOMENT })).toBe('verified');
    expect(storeFactsOf(stateWith({ settings: null })).address).toBe('none');
  });

  it('knows the home is named, located and has push only when they differ from the defaults', () => {
    const bare = storeFactsOf(stateWith({}));
    expect([bare.homeNamed, bare.located, bare.pushConfigured]).toEqual([false, false, false]);
    const set = storeFactsOf(
      stateWith({
        settings: settings({
          home_name: 'Villa',
          latitude: 59,
          longitude: 18,
          push_project_id: 'p',
        }),
      }),
    );
    expect([set.homeNamed, set.located, set.pushConfigured]).toEqual([true, true, true]);
    expect(storeFactsOf(stateWith({ settings: settings({ latitude: 59 }) })).located).toBe(false);
  });

  it('takes the owner name from the profile in the first position', () => {
    const named = [profile(2, 'Sam', { position: 1 }), profile(1, 'Me', { position: 0 })];
    expect(storeFactsOf(stateWith({ profiles: named })).ownerNamed).toBe(false);
    const renamed = [profile(2, 'Me', { position: 1 }), profile(1, 'Ada', { position: 0 })];
    expect(storeFactsOf(stateWith({ profiles: renamed })).ownerNamed).toBe(true);
    expect(storeFactsOf(stateWith({ profiles: [] })).ownerNamed).toBe(false);
  });

  it('counts a paired phone only for an Android client that is not built in', () => {
    const phone = (over: Record<string, unknown>): boolean =>
      storeFactsOf(stateWith({ clients: [client(1, { platform: 'android', ...over })] }))
        .phonePaired;
    expect(phone({})).toBe(true);
    expect(phone({ built_in: true })).toBe(false);
    expect(phone({ platform: 'web' })).toBe(false);
  });

  it('leaves hidden devices out of the device and room counts', () => {
    const facts = storeFactsOf(
      stateWith({
        devices: [
          deviceFixture(0),
          deviceFixture(1, { room_id: null }),
          deviceFixture(2, { room_id: null, hidden: true }),
        ],
      }),
    );
    expect(facts.devices).toBe(2);
    expect(facts.unroomed).toBe(1);
  });

  it('counts only linked accounts', () => {
    const facts = storeFactsOf(
      stateWith({ links: [link('linked'), link('unlinked'), link('linking')] }),
    );
    expect(facts.linkedAccounts).toBe(1);
  });

  it('counts OAuth clients and unrevoked tokens as assistants', () => {
    const facts = storeFactsOf(
      stateWith({ oauth: ['one'], tokens: [token(1, false), token(2, true)] }),
    );
    expect(facts.assistants).toBe(2);
  });

  it('reads Fitness readiness from the signed-in profile and not at all without one', () => {
    const ready = profile(1, 'Ada', { sex: 'female', birth_date: '1990-01-01', height_cm: 170 });
    expect(storeFactsOf(stateWith({ profiles: [ready], profileId: ID(1) })).fitnessReady).toBe(
      true,
    );
    const bare = profile(1, 'Ada');
    expect(storeFactsOf(stateWith({ profiles: [bare], profileId: ID(1) })).fitnessReady).toBe(
      false,
    );
    expect(storeFactsOf(stateWith({ profiles: [bare] })).fitnessReady).toBeNull();
  });
});
