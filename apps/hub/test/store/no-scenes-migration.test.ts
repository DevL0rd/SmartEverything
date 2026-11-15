import { DatabaseSync } from 'node:sqlite';
import {
  AUTOMATION_V4,
  JSON_VALUE,
  NODE_REGISTRY,
  STATIC_KIND_LOOKUP,
} from '@smarteverything/domain';
import { canonicalPlan } from '@smarteverything/flow/compile/hash';
import { lower } from '@smarteverything/flow/compile/lower';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { NO_SCENES_MIGRATION } from '../../src/store/migrations/no-scenes';
import { canonicalPlanText, planHashOf } from '../../src/store/repositories/automation-plans';
import { readAutomation } from '../../src/store/repositories/automation-trees';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-11-14T09:00:00.000Z';
const MOVIE = '7e000000-0000-4000-8000-000000000001';
const AWAY = '7e000000-0000-4000-8000-000000000002';
const LIGHTS = '7e000000-0000-4000-8000-000000000003';
const OLD_AWAY = '7e000000-0000-4000-8000-000000000004';
const LAMP = '7e000000-0000-4000-8000-000000000005';
const PROFILE = '7e000000-0000-4000-8000-000000000006';
const ALARM = '7e000000-0000-4000-8000-000000000007';
const COLLECTION = '7e000000-0000-4000-8000-00000000000a';
const ITEM = '7e000000-0000-4000-8000-000000000008';
const MESSAGE = '7e000000-0000-4000-8000-000000000009';

const BEFORE = MIGRATIONS.filter((migration) => migration.version < NO_SCENES_MIGRATION.version);
const THROUGH = MIGRATIONS.filter((migration) => migration.version <= NO_SCENES_MIGRATION.version);

const TEXT = z.object({ text: z.string() });
const NAMED = z.object({ id: z.string(), name: z.string(), definition: z.string() });

const ids = {
  trigger: '7e000000-0000-4000-8000-000000000101',
  start: '7e000000-0000-4000-8000-000000000102',
  movie: '7e000000-0000-4000-8000-000000000103',
  save: '7e000000-0000-4000-8000-000000000104',
  lamp: '7e000000-0000-4000-8000-000000000105',
};

const SET_LAMP = {
  target: { lit: { device: LAMP } },
  control: { lit: 'power' },
  to: { lit: false },
};

const SAVE = { target: { lit: { device: LAMP } }, name: { lit: 'Snapshot' } };

const LIGHTS_PROGRAM = {
  version: 4,
  kind: 'automation',
  triggers: [{ id: ids.trigger, key: 'called', kind: 'trigger.called', ports: {} }],
  inputs: [],
  outputs: [],
  variables: [],
  nodes: [
    { id: ids.start, key: 'start', kind: 'flow.start', to: { next: 'movie' } },
    {
      id: ids.movie,
      key: 'movie',
      kind: 'scene.run',
      ports: { scene: { lit: MOVIE } },
      to: { next: 'save' },
    },
    { id: ids.save, key: 'save', kind: 'scene.capture', ports: SAVE, to: { next: 'lamp' } },
    { id: ids.lamp, key: 'lamp', kind: 'device.set', ports: SET_LAMP },
  ],
  policy: { mode: 'single' },
};

const LIGHTS_PLAN = {
  version: 1,
  subject: 'automation',
  exits: [],
  variables: [],
  body: {
    op: 'seq',
    ops: [
      {
        op: 'effect',
        at: { id: ids.movie, key: 'movie' },
        kind: 'scene.run',
        params: { scene: { lit: MOVIE } },
        retry: 'idempotent',
        budget: 'command',
      },
      {
        op: 'effect',
        at: { id: ids.save, key: 'save' },
        kind: 'scene.capture',
        params: { ...SAVE, overwrite: { lit: false } },
        retry: 'external',
        budget: 'effects',
      },
      {
        op: 'effect',
        at: { id: ids.lamp, key: 'lamp' },
        kind: 'device.set',
        params: SET_LAMP,
        retry: 'relative',
        budget: 'command',
      },
    ],
  },
};

const BOARD = {
  version: 2,
  classes: {
    compact: {
      widgets: [
        { key: 'a', type: 'scenes', size: 'M' },
        { key: 'b', type: 'weather', size: 'M' },
      ],
    },
  },
};

const NAVIGATION = {
  version: 1,
  value: {
    items: [
      {
        kind: 'pin',
        id: 'p1',
        target: { kind: 'scene', sceneId: MOVIE },
        title: null,
        icon: null,
      },
      {
        kind: 'folder',
        id: 'f1',
        title: 'Shortcuts',
        icon: 'folder',
        items: [
          {
            kind: 'pin',
            id: 'p2',
            target: { kind: 'page', path: 'automations.scenes' },
            title: null,
            icon: null,
          },
        ],
      },
    ],
    hidden: [],
  },
};

let database: DatabaseSync;

function value(query: string): string | undefined {
  return new Sql(database).get(TEXT, query)?.text;
}

function json(query: string): unknown {
  return JSON.parse(value(query) ?? 'null');
}

function seed(): void {
  const run = (query: string, ...values: (string | number | null)[]): void => {
    database.prepare(query).run(...values);
  };
  run(
    'insert into profiles (id, name, colour, position, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    PROFILE,
    'Ida',
    'amber',
    0,
    NOW,
    NOW,
  );
  run(
    `insert into planner_collections
       (id, profile_id, kind, name, colour, icon, position, visible, default_reminders, audience, source, google, feed, created_at, updated_at)
     values (?, ?, 'list', 'Home', 'home', 'house', 0, 1, '[]', 'personal', 'local', null, null, ?, ?)`,
    COLLECTION,
    PROFILE,
    NOW,
    NOW,
  );
  const scene =
    'insert into scenes (id, name, icon, actions, position, created_at) values (?, ?, ?, ?, ?, ?)';
  run(
    scene,
    MOVIE,
    'Movie',
    'film',
    JSON.stringify([
      { type: 'command', deviceId: LAMP, capability: 'power', value: true },
      { type: 'command', deviceId: LAMP, capability: 'brightness', value: 30 },
    ]),
    0,
    NOW,
  );
  run(scene, AWAY, 'Away', 'sparkles', '[]', 1, NOW);
  const automation = `insert into automations (id, name, enabled, definition, created_at, updated_at)
    values (?, ?, 1, ?, ?, ?)`;
  run(automation, OLD_AWAY, 'Away', JSON.stringify({ ...LIGHTS_PROGRAM, nodes: [] }), NOW, NOW);
  run(automation, LIGHTS, 'Lights', JSON.stringify(LIGHTS_PROGRAM), NOW, NOW);
  const planText = canonicalPlanText(JSON_VALUE.parse(LIGHTS_PLAN));
  const hash = planHashOf(JSON_VALUE.parse(LIGHTS_PLAN));
  run(
    "insert into automation_plans (hash, kind, json, created_at) values (?, 'automation', ?, ?)",
    hash,
    planText,
    NOW,
  );
  run(
    `insert into automation_revisions (automation_id, revision, definition, plan_hash, saved_at)
     values (?, 1, ?, ?, ?)`,
    LIGHTS,
    JSON.stringify(LIGHTS_PROGRAM),
    hash,
    NOW,
  );
  run(
    `insert into planner_alarms (id, profile_id, time, days, enabled, sound, ramp_seconds, vibrate,
       snooze_minutes, wake_scene_id, wake_lead_minutes, targets, watch, source, created_at, updated_at)
     values (?, ?, '07:00', '[]', 1, 'tone', 0, 0, 5, ?, 10, '[]', '[]', 'planner', ?, ?)`,
    ALARM,
    PROFILE,
    MOVIE,
    NOW,
    NOW,
  );
  run(
    'insert into planner_preferences (profile_id, preferences, updated_at) values (?, ?, ?)',
    PROFILE,
    JSON.stringify({
      clock: { wake_scene_id: MOVIE },
      bedtime: { enabled: false, wind_down_scene_id: AWAY },
    }),
    NOW,
  );
  run(
    `insert into planner_items (id, profile_id, collection_id, kind, title, notes, tags, all_day,
       exdates, status, position, completion, attachments, reminders, ical_sequence, created_by,
       created_at, updated_at)
     values (?, ?, ?, 'task', 'Film night', '', '[]', 0, '[]', 'open', 1, '{}', ?, '[]', 0,
       'person', ?, ?)`,
    ITEM,
    PROFILE,
    COLLECTION,
    JSON.stringify([
      { kind: 'scene', sceneId: MOVIE },
      { kind: 'link', url: 'https://example.com', title: null },
    ]),
    NOW,
    NOW,
  );
  run(
    'insert into layouts (profile_id, page, layout, updated_at) values (?, ?, ?, ?)',
    PROFILE,
    'home',
    JSON.stringify(BOARD),
    NOW,
  );
  run(
    'insert into layouts (profile_id, page, layout, updated_at) values (?, ?, ?, ?)',
    PROFILE,
    'navigation',
    JSON.stringify(NAVIGATION),
    NOW,
  );
  run(
    `insert into assistant_messages (id, profile_id, role, kind, author, text, created_at, updated_at, embeds)
     values (?, ?, 'responder', 'text', 'Assistant', 'Done', ?, ?, ?)`,
    MESSAGE,
    PROFILE,
    NOW,
    NOW,
    JSON.stringify([
      { kind: 'scenes' },
      { kind: 'scene_link', id: MOVIE, value: null },
      { kind: 'weather' },
    ]),
  );
  run(
    `insert into scheduled_actions (id, profile_id, via, timing, occurrences, steps, step_lines,
       device_ids, state, results, created_at, updated_at)
     values ('plan', ?, 'app', '{}', '[]', ?, '[]', '[]', 'scheduled', '[]', ?, ?)`,
    PROFILE,
    JSON.stringify([
      { kind: 'tool', tool: 'scene_run', args: { sceneId: MOVIE }, stopOnFailure: false },
      { kind: 'wait', seconds: 5 },
    ]),
    NOW,
    NOW,
  );
  run('update settings set mcp_disabled_tools = \'["scene_run","device_read"]\'');
  run(
    `insert into commands (id, capability, value, source, created_at, expires_at)
     values ('cmd', 'power', 'true', 'scene', ?, ?)`,
    NOW,
    NOW,
  );
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  migrate(new Sql(database), BEFORE, NOW, testLogger());
  database.exec('pragma foreign_keys = off');
  database
    .prepare(
      "insert into settings (id, home_name, updated_at) values (1, 'Home', ?) on conflict (id) do nothing",
    )
    .run(NOW);
  seed();
  migrate(new Sql(database), THROUGH, NOW, testLogger());
});

describe('the no-scenes migration', () => {
  it('turns every scene into an automation run by hand with the same id, name and actions', () => {
    const rows = new Sql(database).all(
      NAMED,
      'select id, name, definition from automations where id in ($movie, $away) order by name',
      { movie: MOVIE, away: AWAY },
    );
    expect(rows.map((row) => [row.id, row.name])).toEqual([
      [AWAY, 'Away 2'],
      [MOVIE, 'Movie'],
    ]);
    const movie = AUTOMATION_V4.parse(JSON.parse(rows[1]?.definition ?? '{}'));
    expect(movie.triggers.map((trigger) => trigger.kind)).toEqual(['trigger.called']);
    expect(movie.nodes.map((node) => [node.kind, node.ports])).toEqual([
      ['flow.start', undefined],
      [
        'device.set',
        { target: { lit: { device: LAMP } }, control: { lit: 'power' }, to: { lit: true } },
      ],
      [
        'device.set',
        { target: { lit: { device: LAMP } }, control: { lit: 'brightness' }, to: { lit: 30 } },
      ],
    ]);
    expect(
      value(`select plan_hash as text from automation_revisions where automation_id = '${MOVIE}'`),
    ).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('runs the new automation from Run scene nodes and drops Save current look', () => {
    const definition = AUTOMATION_V4.parse(
      json(`select definition as text from automations where id = '${LIGHTS}'`),
    );
    expect(definition.nodes.map((node) => [node.key, node.kind, node.to])).toEqual([
      ['start', 'flow.start', { next: 'movie' }],
      ['movie', 'automation.run', { next: 'lamp' }],
      ['lamp', 'device.set', undefined],
    ]);
    expect(definition.nodes[1]?.ports).toEqual({ automation: { lit: MOVIE } });
    const read = readAutomation(definition, STATIC_KIND_LOOKUP);
    if (!read.ok) throw new Error('The rewritten automation is not a graph.');
    const lowered = lower(read.tree, { kinds: (id) => NODE_REGISTRY.get(id) });
    if (!lowered.ok) throw new Error('The rewritten automation does not compile.');
    const compiled = planHashOf(JSON_VALUE.parse(JSON.parse(canonicalPlan(lowered.plan))));
    expect(
      value(`select plan_hash as text from automation_revisions where automation_id = '${LIGHTS}'`),
    ).toBe(compiled);
  });

  it('moves every stored reference to a scene onto its automation', () => {
    expect(
      value(`select wake_automation_id as text from planner_alarms where id = '${ALARM}'`),
    ).toBe(MOVIE);
    expect(json('select preferences as text from planner_preferences')).toEqual({
      clock: { wake_automation_id: MOVIE },
      bedtime: { enabled: false, wind_down_automation_id: AWAY },
    });
    expect(json('select attachments as text from planner_items')).toEqual([
      { kind: 'automation', automationId: MOVIE },
      { kind: 'link', url: 'https://example.com', title: null },
    ]);
    expect(json("select layout as text from layouts where page = 'home'")).toEqual({
      version: 2,
      classes: {
        compact: {
          widgets: [
            { key: 'a', type: 'automations', size: 'M' },
            { key: 'b', type: 'weather', size: 'M' },
          ],
        },
      },
    });
    const navigation = z
      .object({ value: z.object({ items: z.array(z.unknown()) }) })
      .parse(json("select layout as text from layouts where page = 'navigation'"));
    expect(navigation.value.items).toEqual([
      {
        kind: 'pin',
        id: 'p1',
        target: { kind: 'automation', automationId: MOVIE, focus: null },
        title: null,
        icon: null,
      },
      {
        kind: 'folder',
        id: 'f1',
        title: 'Shortcuts',
        icon: 'folder',
        items: [
          {
            kind: 'pin',
            id: 'p2',
            target: { kind: 'page', path: 'automations' },
            title: null,
            icon: null,
          },
        ],
      },
    ]);
    expect(json('select embeds as text from assistant_messages')).toEqual([
      { kind: 'automation_link', id: MOVIE, value: null },
      { kind: 'weather' },
    ]);
    expect(json("select steps as text from scheduled_actions where id = 'plan'")).toEqual([
      { kind: 'tool', tool: 'automation_run', args: { automationId: MOVIE }, stopOnFailure: false },
      { kind: 'wait', seconds: 5 },
    ]);
    expect(json('select mcp_disabled_tools as text from settings')).toEqual(['device_read']);
    expect(value("select source as text from commands where id = 'cmd'")).toBe('automation');
  });

  it('leaves no scenes table, scene command source or wake scene column', () => {
    const schema = new Sql(database)
      .all(
        TEXT,
        `select coalesce(sql, name) as text from sqlite_master
         where name not like 'vacuum_scene%' and tbl_name not like 'vacuum_scene%'`,
      )
      .map((row) => row.text)
      .join('\n');
    expect(schema).not.toMatch(/scene/u);
  });
});
