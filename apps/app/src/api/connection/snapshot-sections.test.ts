import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, type TablesAnswer } from './client';
import { API_ENDPOINTS as E, EMPTY_LAYOUT, type Snapshot } from '@smarteverything/domain';
import { parseAutomationRows } from '../../features/automations/data/automation-rows';
import { snapshotWire } from '../../store/snapshot-fixture';

const TOKEN = `set_${'a'.repeat(64)}`;
const CORRUPT_FIREWALL = {
  checkedAt: '2026-10-01T00:00:00.000Z',
  backend: 'ufw',
  filtering: true,
  detail: 'ok',
  openings: [{ id: 'camera:10', rule: { purpose: 'camera', source: 12 } }],
  plan: null,
  cameras: [],
};

const MOMENT = '2026-10-18T10:00:00+07:00';

function automationRow(id: string, definition: unknown): Record<string, unknown> {
  return {
    id,
    name: 'Notice',
    enabled: true,
    revision: 1,
    definition,
    draft: null,
    layout: EMPTY_LAYOUT,
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: MOMENT,
    updated_at: MOMENT,
  };
}

const GOOD_ID = '00000000-0000-4000-8000-000000000011';
const BAD_ID = '00000000-0000-4000-8000-000000000012';

const GRAPH_DEFINITION = {
  version: 4,
  kind: 'automation',
  triggers: [],
  inputs: [],
  outputs: [],
  variables: [],
  nodes: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      key: 'start',
      kind: 'flow.start',
      to: { next: 'notice' },
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      key: 'notice',
      kind: 'notify.feed',
      ports: { message: { lit: 'hello' } },
    },
  ],
  policy: { mode: 'single' },
};

function withAutomations(rows: readonly unknown[]): Record<string, unknown> {
  const wire = snapshotWire();
  const tables = wire['tables'];
  if (typeof tables !== 'object' || tables === null) throw new Error('the fixture has no tables');
  return { ...wire, tables: { ...tables, automations: rows } };
}

function clientAnswering(body: unknown): ApiClient {
  return new ApiClient({
    baseUrl: 'https://home.example.com',
    token: TOKEN,
    fetch: (): Promise<Response> => Promise.resolve(new Response(JSON.stringify(body))),
    onUnauthorized: vi.fn(),
  });
}

async function read(body: unknown): Promise<TablesAnswer<Snapshot>> {
  return clientAnswering(body).callTables(
    E.readSnapshot,
    { query: {} },
    {
      roots: ['tables', 'owner'],
      sections: ['firewall'],
    },
  );
}

describe('reading the snapshot section by section', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps every other section when the firewall section is unreadable', async () => {
    const answer = await read(snapshotWire(CORRUPT_FIREWALL));
    const data = answer.data;
    expect(data.firewall).toBeNull();
    expect(data.tables.rooms).toHaveLength(1);
    expect(data.seq).toBe(7);
    expect(answer.unreadable).toHaveLength(1);
    expect(answer.unreadable[0]?.section).toBe('firewall');
    expect(answer.unreadable[0]?.path.startsWith('firewall.openings.0')).toBe(true);
  });

  it('reads a healthy snapshot with nothing unreadable', async () => {
    const answer = await read(snapshotWire());
    expect(answer.unreadable).toHaveLength(0);
    expect(answer.data.firewall).not.toBeNull();
  });

  it('drops only a malformed automation row, reports the table as outdated and stays connected', async () => {
    const answer = await read(
      withAutomations([
        automationRow(GOOD_ID, GRAPH_DEFINITION),
        automationRow(BAD_ID, { version: 3, kind: 'automation', body: { nodes: [] } }),
      ]),
    );
    const { automations, rooms } = answer.data.tables;
    expect(automations.map((kept) => kept.id)).toEqual([GOOD_ID]);
    expect(answer.skipped).toEqual(['tables.automations']);
    expect(answer.unreadable).toHaveLength(0);
    expect(rooms).toHaveLength(1);
    expect(answer.data.seq).toBe(7);
    const parsed = parseAutomationRows(automations, STATIC_KIND_LOOKUP);
    expect(parsed.rejected).toBe(0);
    expect(parsed.rows.map((kept) => kept.id)).toEqual([GOOD_ID]);
  });

  it('still refuses a snapshot whose essential session part is unreadable', async () => {
    const wire = { ...snapshotWire(), session: { broken: true } };
    await expect(read(wire)).rejects.toThrow();
  });
});
