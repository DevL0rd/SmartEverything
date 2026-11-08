import { describe, expect, it } from 'vitest';
import {
  ACCESS_LEVELS,
  RUNTIME_DEFAULT,
  accessFootnote,
  accessPill,
  accessPillLabel,
  accessSections,
  type AccessSelection,
} from './ai-access';

function titles(engine: Parameters<typeof accessSections>[0]): readonly (readonly string[])[] {
  return accessSections(engine).map((section) => section.options.map((opt) => opt.title));
}

describe('accessSections', () => {
  it('gives Claude one Mode section in the designed order', () => {
    expect(accessSections('claude').map((section) => section.title)).toEqual(['Mode']);
    expect(titles('claude')).toEqual([
      [
        'As the runtime is set up',
        'Ask first',
        'Allow edits',
        'Plan only',
        'Automatic approvals',
        'Full access',
        'Decline unapproved actions',
      ],
    ]);
  });

  it('gives Codex Access and Approvals sections with No prompts', () => {
    expect(accessSections('codex').map((section) => section.title)).toEqual([
      'Access',
      'Approvals',
    ]);
    expect(titles('codex')).toEqual([
      ['As the runtime is set up', 'Read only', 'Allow edits', 'Full access', 'External sandbox'],
      ['As the runtime is set up', 'Ask first', 'Ask when needed', 'No prompts'],
    ]);
  });

  it('keeps option values unique inside each section', () => {
    for (const engine of ['claude', 'codex'] as const) {
      for (const section of accessSections(engine)) {
        const values = section.options.map((opt) => opt.value);
        expect(new Set(values).size).toBe(values.length);
      }
    }
  });

  it('marks only the runtime default rows with the runtime default value', () => {
    const rows = accessSections('codex').flatMap((section) => section.options);
    expect(rows.filter((opt) => opt.value === RUNTIME_DEFAULT)).toHaveLength(2);
  });
});

describe('accessPill', () => {
  const cases: readonly (readonly [string, AccessSelection, string, string])[] = [
    [
      'harness read only',
      {
        kind: 'harness',
        permission: { sandbox: 'read-only', approval: 'on-request' },
        title: null,
      },
      'Read only',
      'eye',
    ],
    [
      'harness allow edits',
      {
        kind: 'harness',
        permission: { sandbox: 'workspace-write', approval: 'on-request' },
        title: null,
      },
      'Edits',
      'pencilShield',
    ],
    ['claude unset', { kind: 'claude', mode: undefined }, 'Runtime', 'shield'],
    ['claude ask first', { kind: 'claude', mode: 'default' }, 'Ask', 'shield'],
    ['claude plan', { kind: 'claude', mode: 'plan' }, 'Plan', 'listCheck'],
    ['claude auto', { kind: 'claude', mode: 'auto' }, 'Auto', 'shieldCheck'],
    ['claude decline', { kind: 'claude', mode: 'dontAsk' }, 'Strict', 'shieldX'],
    [
      'codex sandbox',
      {
        kind: 'codex',
        sandbox: { type: 'externalSandbox', networkAccess: 'restricted' },
        approval: undefined,
      },
      'Sandbox',
      'box',
    ],
  ];

  it.each(cases)('labels %s', (_name, selection, label, icon) => {
    const pill = accessPill(selection);
    expect(pill.label).toBe(label);
    expect(pill.icon).toBe(icon);
    expect(pill.tone).toBe('neutral');
  });

  it.each([
    {
      kind: 'harness',
      permission: { sandbox: 'danger-full-access', approval: 'never' },
      title: null,
    },
    { kind: 'claude', mode: 'bypassPermissions' },
    { kind: 'codex', sandbox: { type: 'dangerFullAccess' }, approval: undefined },
  ] as const satisfies readonly AccessSelection[])(
    'maps Full access of the $kind engine to the caution shield-alert pill',
    (selection) => {
      const pill = accessPill(selection);
      expect(pill).toMatchObject({
        level: 'full',
        label: 'Full',
        icon: 'shieldAlert',
        tone: 'caution',
      });
    },
  );

  it('never uses the caution tone for any other level', () => {
    const cautious = Object.entries(ACCESS_LEVELS)
      .filter(([, look]) => look.tone === 'caution')
      .map(([level]) => level);
    expect(cautious).toEqual(['full']);
  });
});

describe('accessPillLabel', () => {
  it('names the long level and the asking setting', () => {
    const pill = accessPill({
      kind: 'harness',
      permission: { sandbox: 'workspace-write', approval: 'on-request' },
      title: 'Workspace write',
    });
    expect(accessPillLabel(pill, false)).toBe('Access: Workspace write, asks when needed');
  });

  it('adds applies next turn when the change is pending', () => {
    const pill = accessPill({
      kind: 'codex',
      sandbox: { type: 'readOnly', networkAccess: false },
      approval: 'never',
    });
    expect(accessPillLabel(pill, true)).toBe('Access: Read only, never asks, applies next turn');
  });

  it('names Claude Ask first by its own title and omits the asking part', () => {
    const pill = accessPill({ kind: 'claude', mode: 'default' });
    expect(accessPillLabel(pill, false)).toBe('Access: Ask first');
  });

  it('names a harness chat by the short level word while its presets are not loaded', () => {
    const pill = accessPill({
      kind: 'harness',
      permission: { sandbox: 'workspace-write', approval: 'on-request' },
      title: null,
    });
    expect(accessPillLabel(pill, false)).toBe('Access: Edits, asks when needed');
  });
});

describe('accessFootnote', () => {
  it('says when a change applies for each engine', () => {
    expect(accessFootnote('harness', false)).toBe('Applies to the next action');
    expect(accessFootnote('codex', false)).toBe('Applies next turn');
    expect(accessFootnote('claude', true)).toBe('Applies when the session restarts');
  });
});
