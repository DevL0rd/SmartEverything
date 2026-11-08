const CLIENT = '00000000-0000-4000-8000-000000000001';

export const READABLE_FIREWALL = {
  checkedAt: '2026-10-01T00:00:00.000Z',
  backend: 'ufw',
  filtering: true,
  detail: 'ok',
  openings: [],
  plan: null,
  cameras: [],
};

export const EMPTY_LATER_TABLES = {
  health_sources: [],
  health_daily: [],
  planner_collections: [],
  planner_items: [],
  planner_occurrences: [],
  planner_alarms: [],
  planner_timers: [],
  planner_stopwatches: [],
  google_accounts: [],
} as const;

export function snapshotWire(firewall: unknown = READABLE_FIREWALL): Record<string, unknown> {
  return {
    seq: 7,
    session: {
      client: {
        id: CLIENT,
        name: 'Phone',
        platform: 'android',
        role: 'member',
        built_in: false,
        created_at: '2026-10-01T00:00:00.000Z',
        last_seen_at: null,
      },
      hub: { version: '1.0.0', startedAt: '2026-10-01T00:00:00.000Z', cameras: 'running' },
    },
    firewall,
    tables: {
      settings: {
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
        updated_at: '2026-10-01T00:00:00.000Z',
      },
      rooms: [{ id: CLIENT, name: 'Kitchen', position: 0 }],
      devices: [],
      device_state: [],
      cameras: [],
      scenes: [],
      automations: [],
      provider_links: [],
      ir_remotes: [],
      ir_codes: [],
      layouts: [],
      events: [],
      commands: [],
      recordings: [],
      ...EMPTY_LATER_TABLES,
    },
    owner: null,
  };
}
