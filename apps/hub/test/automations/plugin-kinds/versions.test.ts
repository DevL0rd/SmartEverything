import {
  AUTOMATION_PLUGIN_KIND_ROW,
  AUTOMATION_V4,
  defineNodeKind,
  type AutomationPluginKindRow,
  type AutomationV4,
  type InputPortDecl,
  type NodeKind,
  type OutputPortDecl,
  type PluginKindStatus,
} from '@smarteverything/domain';
import { interfaceHash } from '@smarteverything/flow/functions/interface-hash';
import { graphNode, idOf, start } from '@smarteverything/flow/test/graph/graph-fixtures';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  availabilityOf,
  judgeKind,
  planKindVersions,
  prunableKinds,
  rewriteProgramKinds,
  usedKindIds,
  versionRaised,
  type KindMigration,
  type KindProposal,
} from '../../../src/automations/plugin-kinds/versions';
import { captureLogs, type CapturedLogs } from '../../support/logs';

const KIND_ID = 'plugin.chat_hub.post_message';
const TRIGGER_ID = 'trigger.plugin.chat_hub.posted';

const input = (name: string, extra: Partial<InputPortDecl> = {}): InputPortDecl => ({
  name,
  type: { t: 'text' },
  required: false,
  description: name,
  ...extra,
});

const output = (name: string, extra: Partial<OutputPortDecl> = {}): OutputPortDecl => ({
  name,
  type: { t: 'text' },
  description: name,
  ...extra,
});

interface Shape {
  readonly inputs?: readonly InputPortDecl[];
  readonly outputs?: readonly OutputPortDecl[];
  readonly exits?: readonly string[];
  readonly version?: string;
}

function kindOf(shape: Shape = {}): NodeKind {
  return defineNodeKind({
    id: KIND_ID,
    name: 'Post a message',
    category: 'plugins',
    icon: 'message',
    class: 'effect',
    description: 'Posts a message.',
    inputs: [...(shape.inputs ?? [input('channel', { required: true }), input('text')])],
    outputs: [...(shape.outputs ?? [output('messageId')])],
    exits: [...(shape.exits ?? ['next'])],
    summary: 'Post a message',
    keywords: [],
    origin: {
      kind: 'plugin',
      id: 'chat-hub',
      name: 'Chat Hub',
      icon: 'puzzle',
      version: shape.version ?? '1',
    },
    access: 'owner',
    tier: 'v1',
  });
}

function rowOf(
  kind: NodeKind,
  version = '1',
  status: PluginKindStatus = 'active',
): AutomationPluginKindRow {
  return AUTOMATION_PLUGIN_KIND_ROW.parse({
    kind_id: kind.id,
    owner: 'plugin:chat-hub',
    version,
    interface_hash: interfaceHash({
      inputs: kind.inputs,
      outputs: kind.outputs,
      exits: kind.exits,
    }),
    declaration: kind,
    status,
    updated: '2026-10-25T10:00:00.000Z',
  });
}

function proposal(shape: Shape, version: string, map?: KindProposal['map']): KindProposal {
  return { kind: kindOf(shape), version, ...(map === undefined ? {} : { map }) };
}

const STORED = rowOf(kindOf());

const NO_MAP_EXIT = { renamed: {}, removedPorts: [] } as const;

function problemsOf(verdict: ReturnType<typeof judgeKind>): readonly string[] {
  return verdict.type === 'rejected' ? verdict.problems : [];
}

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

describe('version order', () => {
  it('raises only when a numeric part grows', () => {
    expect(versionRaised('1', '2')).toBe(true);
    expect(versionRaised('1.2.0', '1.10.0')).toBe(true);
    expect(versionRaised('1.2', '1.2.0')).toBe(false);
    expect(versionRaised('2.0.0', '1.9.9')).toBe(false);
    expect(versionRaised('1', '1')).toBe(false);
    expect(versionRaised('1', 'next')).toBe(false);
  });
});

describe('judging a new version of a kind', () => {
  it('accepts a first declaration and an identical interface', () => {
    expect(judgeKind(undefined, proposal({}, '1'))).toEqual({ type: 'accepted', migration: null });
    expect(judgeKind(STORED, proposal({}, '1'))).toEqual({ type: 'accepted', migration: null });
  });

  it('accepts new optional ports at the same version without any map', () => {
    const grown = proposal(
      {
        inputs: [input('channel', { required: true }), input('text'), input('silent')],
        outputs: [output('messageId'), output('sentAt', { optional: true })],
      },
      '1',
    );
    expect(judgeKind(STORED, grown)).toEqual({ type: 'accepted', migration: null });
  });

  it('rejects a new required input, and a new plain output needs a raised version', () => {
    const required = proposal(
      {
        inputs: [
          input('channel', { required: true }),
          input('text'),
          input('topic', { required: true }),
        ],
      },
      '2',
    );
    expect(problemsOf(judgeKind(STORED, required)).join(' ')).toContain('topic');
    const plainOutput = proposal({ outputs: [output('messageId'), output('sentAt')] }, '1');
    expect(problemsOf(judgeKind(STORED, plainOutput)).join(' ')).toContain(
      'version must be raised',
    );
    expect(judgeKind(STORED, { ...plainOutput, version: '2' }).type).toBe('accepted');
  });

  it('rejects a removed port when no map names it', () => {
    const verdict = judgeKind(
      STORED,
      proposal({ inputs: [input('channel', { required: true })] }, '2'),
    );
    expect(problemsOf(verdict).join(' ')).toContain('removedPorts');
  });

  it('accepts a removed port with the version raised and the port listed', () => {
    const verdict = judgeKind(
      STORED,
      proposal({ inputs: [input('channel', { required: true })] }, '2', {
        renamed: {},
        removedPorts: ['text'],
      }),
    );
    expect(verdict).toEqual({
      type: 'accepted',
      migration: {
        kindId: KIND_ID,
        fromVersion: '1',
        toVersion: '2',
        renamedInputs: {},
        renamedOutputs: {},
        removedInputs: ['text'],
        removedOutputs: [],
      },
    });
  });

  it('rejects a map without a raised version', () => {
    const verdict = judgeKind(
      STORED,
      proposal({ inputs: [input('channel', { required: true })] }, '1', {
        renamed: {},
        removedPorts: ['text'],
      }),
    );
    expect(problemsOf(verdict).join(' ')).toContain('version must be raised above 1');
  });

  it('accepts a rename on inputs and outputs and records both sides', () => {
    const verdict = judgeKind(
      STORED,
      proposal(
        {
          inputs: [input('channel', { required: true }), input('body')],
          outputs: [output('id')],
        },
        '2',
        { renamed: { text: 'body', messageId: 'id' }, removedPorts: [] },
      ),
    );
    expect(verdict).toMatchObject({
      type: 'accepted',
      migration: {
        renamedInputs: { text: 'body' },
        renamedOutputs: { messageId: 'id' },
        removedInputs: [],
        removedOutputs: [],
      },
    });
  });

  it('rejects a rename that also changes the type, because stored values cannot be converted', () => {
    const verdict = judgeKind(
      STORED,
      proposal(
        {
          inputs: [input('channel', { required: true }), input('body', { type: { t: 'number' } })],
        },
        '2',
        { renamed: { text: 'body' }, removedPorts: [] },
      ),
    );
    expect(problemsOf(verdict).join(' ')).toContain('cannot be rewritten');
  });

  it('rejects a map that contradicts the new declaration', () => {
    const stillThere = judgeKind(
      STORED,
      proposal(
        { inputs: [input('channel', { required: true }), input('text'), input('body')] },
        '2',
        { renamed: { text: 'body' }, removedPorts: [] },
      ),
    );
    expect(problemsOf(stillThere).join(' ')).toContain('still declared');
    const both = judgeKind(
      STORED,
      proposal({ inputs: [input('channel', { required: true })] }, '2', {
        renamed: { text: 'body' },
        removedPorts: ['text'],
      }),
    );
    expect(problemsOf(both).join(' ')).toContain('renamed and as removed');
    const collide = judgeKind(
      STORED,
      proposal({ inputs: [input('channel', { required: true }), input('body')] }, '2', {
        renamed: { text: 'body', channel: 'body' },
        removedPorts: [],
      }),
    );
    expect(problemsOf(collide).join(' ')).toContain('one name');
  });

  it('rejects an exit change even with a map and a new version', () => {
    const verdict = judgeKind(STORED, proposal({ exits: ['done'] }, '2', NO_MAP_EXIT));
    expect(problemsOf(verdict).join(' ')).toContain('cannot be rewritten');
  });

  it('ignores a map that was already applied by an earlier version', () => {
    const migrated = rowOf(
      kindOf({ inputs: [input('channel', { required: true }), input('body')] }),
      '2',
    );
    const verdict = judgeKind(
      migrated,
      proposal(
        { inputs: [input('channel', { required: true }), input('body'), input('extra')] },
        '2',
        {
          renamed: { text: 'body' },
          removedPorts: [],
        },
      ),
    );
    expect(verdict).toEqual({ type: 'accepted', migration: null });
  });
});

describe('planning a plugin publication', () => {
  it('records accepted migrations and keeps the old declaration of a rejected kind', () => {
    const rejectedShape = proposal({ inputs: [input('channel', { required: true })] }, '2');
    const plan = planKindVersions([STORED], [rejectedShape]);
    expect(plan.accepted).toEqual([]);
    expect(plan.kept).toEqual([STORED.declaration]);
    expect(plan.rejections).toHaveLength(1);
    expect(plan.statusDetail).toContain(KIND_ID);
    expect(logs.events()).toContain('plugin_kinds.version_rejected');

    const fine = proposal({ inputs: [input('channel', { required: true })] }, '2', {
      renamed: {},
      removedPorts: ['text'],
    });
    const next = planKindVersions([STORED], [fine]);
    expect(next.accepted).toEqual([fine]);
    expect(next.kept).toEqual([]);
    expect(next.migrations.map((entry) => entry.removedInputs)).toEqual([['text']]);
    expect(next.statusDetail).toBeNull();
    expect(logs.events()).toContain('plugin_kinds.migration_recorded');
  });

  it('accepts a kind that has no stored row yet', () => {
    const plan = planKindVersions([], [proposal({}, '1')]);
    expect(plan.accepted).toHaveLength(1);
    expect(plan.migrations).toEqual([]);
  });
});

const MIGRATION: KindMigration = {
  kindId: KIND_ID,
  fromVersion: '1',
  toVersion: '2',
  renamedInputs: { text: 'body' },
  renamedOutputs: { messageId: 'id' },
  removedInputs: ['legacy'],
  removedOutputs: ['gone'],
};

const TRIGGER_MIGRATION: KindMigration = {
  kindId: TRIGGER_ID,
  fromVersion: '1',
  toVersion: '2',
  renamedInputs: { room: 'channel' },
  renamedOutputs: { author: 'sender' },
  removedInputs: [],
  removedOutputs: [],
};

function stored(): AutomationV4 {
  return AUTOMATION_V4.parse({
    version: 4,
    kind: 'automation',
    triggers: [
      {
        id: idOf('posted'),
        key: 'posted',
        kind: TRIGGER_ID,
        ports: { room: { lit: 'general' } },
      },
    ],
    inputs: [],
    outputs: [],
    variables: [],
    nodes: [
      start('post'),
      graphNode('post', KIND_ID, {
        to: { next: 'tell' },
        ports: {
          channel: { lit: 'general' },
          text: { wire: { from: 'posted', port: 'author' } },
          legacy: { lit: 1 },
        },
      }),
      graphNode('tell', 'notify.person', {
        ports: {
          body: { wire: { from: 'post', port: 'messageId' } },
          title: { wire: { from: 'post', port: 'gone' } },
          other: { wire: { from: 'posted', port: 'author' } },
        },
      }),
    ],
    policy: { mode: 'single' },
  });
}

describe('rewriting stored programs', () => {
  it('renames and drops node ports and re-points wires that read renamed outputs', () => {
    const before = stored();
    const frozen = structuredClone(before);
    const result = rewriteProgramKinds(before, [MIGRATION, TRIGGER_MIGRATION]);
    expect(before).toEqual(frozen);
    const post = result.program.nodes.find((node) => node.key === 'post');
    expect(post?.ports).toEqual({
      channel: { lit: 'general' },
      body: { wire: { from: 'posted', port: 'sender' } },
    });
    const tell = result.program.nodes.find((node) => node.key === 'tell');
    expect(tell?.ports).toEqual({
      body: { wire: { from: 'post', port: 'id' } },
      title: { wire: { from: 'post', port: 'gone' } },
      other: { wire: { from: 'posted', port: 'sender' } },
    });
    const [trigger] = result.program.triggers;
    expect(trigger?.ports).toEqual({ channel: { lit: 'general' } });
    expect(AUTOMATION_V4.safeParse(result.program).success).toBe(true);
    expect(result.rewritten).toBeGreaterThan(0);
  });

  it('reports a wire to a removed output instead of guessing', () => {
    const result = rewriteProgramKinds(stored(), [MIGRATION]);
    expect(result.unresolved).toEqual([
      { key: 'post', kind: KIND_ID, port: 'gone', reason: 'the output was removed' },
    ]);
    expect(logs.events()).toContain('plugin_kinds.migration_unresolved');
  });

  it('keeps a port whose new name is already set and says so', () => {
    const clash = structuredClone(stored());
    const node = clash.nodes.find((entry) => entry.key === 'post');
    if (node?.ports !== undefined) node.ports['body'] = { lit: 'x' };
    const result = rewriteProgramKinds(clash, [MIGRATION]);
    expect(result.unresolved).toContainEqual({
      key: 'post',
      kind: KIND_ID,
      port: 'text',
      reason: 'body is already set',
    });
    const kept = result.program.nodes.find((entry) => entry.key === 'post');
    expect(kept?.ports?.['text']).toEqual({ wire: { from: 'posted', port: 'author' } });
  });

  it('hands back the same program when no migration touches it', () => {
    const before = stored();
    const none = rewriteProgramKinds(before, []);
    expect(none.program).toBe(before);
    expect(none.rewritten).toBe(0);
    const unrelated = rewriteProgramKinds(before, [{ ...MIGRATION, kindId: 'plugin.other.kind' }]);
    expect(unrelated.program).toBe(before);
  });

  it('rewrites twice to the same result', () => {
    const once = rewriteProgramKinds(stored(), [MIGRATION, TRIGGER_MIGRATION]);
    const twice = rewriteProgramKinds(once.program, [MIGRATION, TRIGGER_MIGRATION]);
    expect(twice.program).toEqual(once.program);
  });
});

describe('retired and off kinds', () => {
  it('prunes retired rows only once no stored program uses them', () => {
    const retired = rowOf(kindOf(), '1', 'retired');
    const off = rowOf(kindOf(), '1', 'off');
    const used = usedKindIds(stored());
    expect([...used].sort()).toEqual(['flow.start', 'notify.person', KIND_ID, TRIGGER_ID].sort());
    expect(prunableKinds([retired], used)).toEqual([]);
    expect(prunableKinds([retired], new Set())).toEqual([KIND_ID]);
    expect(prunableKinds([off, STORED], new Set())).toEqual([]);
  });

  it('describes off and retired kinds for the lint rules from their own declaration', () => {
    const replaced = { ...kindOf(), replacedBy: 'plugin.chat_hub.send' };
    expect(availabilityOf(rowOf(replaced, '1', 'retired'))).toEqual({
      status: 'retired',
      plugin: 'Chat Hub',
      replacedBy: 'plugin.chat_hub.send',
    });
    expect(availabilityOf(rowOf(kindOf(), '1', 'off'))).toEqual({
      status: 'off',
      plugin: 'Chat Hub',
    });
    expect(availabilityOf(STORED)).toBeUndefined();
  });
});
