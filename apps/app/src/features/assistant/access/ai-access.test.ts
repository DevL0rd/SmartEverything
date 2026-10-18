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
  it('gives the SmartEverything runtime a change section and an asking section', () => {
    expect(accessSections('harness').map((section) => section.title)).toEqual([
      'What it can change',
      'When it asks',
    ]);
    expect(titles('harness')).toEqual([
      ['Read only', 'Allow edits', 'Full access'],
      ['Ask when needed', 'Never ask'],
    ]);
  });

  it('gives Claude one Mode section in the designed order', () => {
    expect(accessSections('claude').map((section) => section.title)).toEqual(['Mode']);
    expect(titles('claude')).toEqual([
      [
        'Runtime default',
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
      ['Runtime default', 'Read only', 'Allow edits', 'Full access', 'External sandbox'],
      ['Runtime default', 'Ask first', 'Ask when needed', 'No prompts'],
    ]);
  });

  it('gives cloud chats no access levels', () => {
    expect(accessSections('cloud')).toEqual([]);
  });

  it('keeps option values unique inside each section', () => {
    for (const engine of ['harness', 'claude', 'codex'] as const) {
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
      { kind: 'harness', permission: { sandbox: 'read-only', approval: 'on-request' } },
      'Read only',
      'eye',
    ],
    [
      'harness allow edits',
      { kind: 'harness', permission: { sandbox: 'workspace-write', approval: 'on-request' } },
      'Edits',
      'pencilShield',
    ],
    ['claude unset', { kind: 'claude', mode: undefined }, 'Default', 'shield'],
    ['claude ask first', { kind: 'claude', mode: 'default' }, 'Default', 'shield'],
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
    ['cloud', { kind: 'cloud', allowedTools: 31 }, 'Tools 31', 'wrench'],
  ];

  it.each(cases)('labels %s', (_name, selection, label, icon) => {
    const pill = accessPill(selection);
    expect(pill.label).toBe(label);
    expect(pill.icon).toBe(icon);
    expect(pill.tone).toBe('neutral');
  });

  it.each([
    { kind: 'harness', permission: { sandbox: 'danger-full-access', approval: 'never' } },
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
    });
    expect(accessPillLabel(pill, false)).toBe('Access: Allow edits, asks when needed');
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

  it('names a cloud chat by its tool allowlist', () => {
    expect(accessPillLabel(accessPill({ kind: 'cloud', allowedTools: 31 }), false)).toBe(
      'Access: Tools for this chat',
    );
  });
});

describe('accessFootnote', () => {
  it('says when a change applies for each engine', () => {
    expect(accessFootnote('harness', false)).toBe('Applies to the next action');
    expect(accessFootnote('codex', false)).toBe('Applies next turn');
    expect(accessFootnote('claude', true)).toBe('Applies when the session restarts');
  });
});
