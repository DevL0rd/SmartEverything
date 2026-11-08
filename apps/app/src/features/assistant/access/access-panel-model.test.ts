import { describe, expect, it } from 'vitest';
import {
  ENGINE,
  type AiHarnessPermission,
  type AiPermissionPresets,
  type Engine,
} from '@smarteverything/domain';
type ClaudeEngine = Extract<Engine, { kind: 'claude' }>;
type CodexEngine = Extract<Engine, { kind: 'codex' }>;
import { cautionIcon, rowKey, type AccessSectionView } from './access-model';
import { accessPill, accessPillLabel, RUNTIME_DEFAULT } from './ai-access';
import {
  applyingKey,
  harnessBlock,
  harnessChoice,
  harnessSections,
  presetName,
  type HarnessFacts,
} from './harness-access';
import {
  claudeChange,
  claudeMode,
  claudeSections,
  codexChange,
  codexSections,
  withClaudeMode,
  WORKING_REASON,
} from './native-access';

const DEVICE = '3f8d2c1e-5a4b-4c6d-9e7f-1a2b3c4d5e6f';

function claudeEngine(settings: Record<string, unknown>): ClaudeEngine {
  const engine = ENGINE.parse({ kind: 'claude', device_id: DEVICE, model: 'm', settings });
  if (engine.kind !== 'claude') throw new Error('Expected a Claude engine.');
  return engine;
}

function codexEngine(settings: Record<string, unknown>): CodexEngine {
  const engine = ENGINE.parse({ kind: 'codex', device_id: DEVICE, model: 'm', settings });
  if (engine.kind !== 'codex') throw new Error('Expected a Codex engine.');
  return engine;
}

const READ_ASK: AiHarnessPermission = { sandbox: 'read-only', approval: 'on-request' };
const EDITS_NEEDED: AiHarnessPermission = { sandbox: 'workspace-write', approval: 'on-request' };
const FULL_NEVER: AiHarnessPermission = { sandbox: 'danger-full-access', approval: 'never' };
const OFFERED = [READ_ASK, EDITS_NEEDED, FULL_NEVER];

const PRESETS: AiPermissionPresets = {
  options: [
    { value: 'read-only', name: 'Read only', description: 'Reads, never writes' },
    { value: 'workspace-write', name: 'Workspace write', description: null },
    { value: 'danger-full-access', name: 'Full access', description: 'Anything' },
  ],
  default_options: [{ value: 'read-only', name: 'Read only', description: null }],
  default_preset: 'read-only',
  custom: { value: 'custom', name: 'Custom', description: 'Matches no preset' },
};

function rowsOf(sections: ReturnType<typeof harnessSections>): AccessSectionView['rows'] {
  return sections.flatMap((section) => section.rows);
}

describe('harnessSections', () => {
  it('lists the presets the runtime reports, with their names and descriptions', () => {
    const sections = harnessSections(PRESETS, OFFERED, EDITS_NEEDED, 'Workstation');
    expect(sections.map((section) => section.id)).toEqual(['access']);
    expect(
      rowsOf(sections).map((row) => [row.key, row.option.title, row.option.description]),
    ).toEqual([
      ['access:read-only', 'Read only', 'Reads, never writes'],
      ['access:workspace-write', 'Workspace write', null],
      ['access:danger-full-access', 'Full access', 'Anything'],
    ]);
    expect(
      rowsOf(sections)
        .filter((row) => row.selected)
        .map((row) => row.key),
    ).toEqual(['access:workspace-write']);
  });

  it('marks a preset the machine never offers', () => {
    const rows = rowsOf(harnessSections(PRESETS, [READ_ASK, EDITS_NEEDED], READ_ASK, 'Laptop'));
    expect(rows.map((row) => row.unavailable)).toEqual([null, null, 'Not offered by Laptop']);
  });

  it('shows the custom state, selected, when the session matches no preset', () => {
    const rows = rowsOf(
      harnessSections(
        { ...PRESETS, options: PRESETS.options.slice(0, 1) },
        OFFERED,
        FULL_NEVER,
        'W',
      ),
    );
    expect(rows.map((row) => row.key)).toEqual(['access:read-only', 'access:custom']);
    expect(rows.find((row) => row.selected)).toMatchObject({
      option: { title: 'Custom', description: 'Matches no preset' },
      unavailable: null,
    });
  });

  it('lists nothing until the runtime has reported its presets', () => {
    expect(harnessSections(null, OFFERED, READ_ASK, 'W')).toEqual([]);
  });
});

describe('presetName', () => {
  it('names the preset the session matches and falls back to Custom for any other', () => {
    expect(presetName(PRESETS, 'workspace-write')).toBe('Workspace write');
    expect(presetName(PRESETS, 'something-else')).toBe('Custom');
    expect(presetName(null, 'workspace-write')).toBeNull();
  });
});

describe('harnessChoice', () => {
  it('switches to the permission of the chosen preset', () => {
    expect(harnessChoice(OFFERED, EDITS_NEEDED, 'read-only')).toEqual(READ_ASK);
    expect(harnessChoice(OFFERED, EDITS_NEEDED, 'danger-full-access')).toEqual(FULL_NEVER);
  });

  it('refuses the unchanged preset, a preset the machine does not offer and custom', () => {
    expect(harnessChoice(OFFERED, EDITS_NEEDED, 'workspace-write')).toBeNull();
    expect(harnessChoice([READ_ASK], READ_ASK, 'workspace-write')).toBeNull();
    expect(harnessChoice(OFFERED, EDITS_NEEDED, 'custom')).toBeNull();
  });
});

describe('harnessBlock', () => {
  const free: HarnessFacts = {
    host: 'Workstation',
    unavailable: null,
    sessionReady: true,
    applying: false,
    waitingConfirm: false,
    switching: false,
    liveChange: true,
    bound: true,
    presets: true,
    choices: 4,
  };

  it('allows the change when nothing blocks it', () => {
    expect(harnessBlock(free)).toBeNull();
  });

  it('names the reason for each block, applying first', () => {
    expect(harnessBlock({ ...free, applying: true, waitingConfirm: true })?.text).toBe(
      'Changing access…',
    );
    expect(harnessBlock({ ...free, waitingConfirm: true })).toMatchObject({
      kind: 'confirm',
      text: 'Waiting for Workstation to confirm the last change',
    });
    expect(harnessBlock({ ...free, unavailable: 'Workstation is offline' })?.text).toBe(
      'Workstation is offline',
    );
    expect(harnessBlock({ ...free, liveChange: false })?.text).toBe(
      'Update Workstation to change access in a running chat',
    );
    expect(harnessBlock({ ...free, bound: false, liveChange: false })).toBeNull();
    expect(harnessBlock({ ...free, presets: false })?.text).toBe(
      'Access options for Workstation aren’t loaded yet',
    );
    expect(harnessBlock({ ...free, choices: 1 })?.text).toBe(
      'Access can’t be changed on Workstation',
    );
  });
});

describe('applyingKey', () => {
  it('points at the row being changed', () => {
    expect(applyingKey(EDITS_NEEDED, FULL_NEVER)).toBe(rowKey('access', 'danger-full-access'));
    expect(applyingKey(EDITS_NEEDED, EDITS_NEEDED)).toBeNull();
    expect(applyingKey(EDITS_NEEDED, undefined)).toBeNull();
  });
});

describe('access pill', () => {
  it('reads the level, the asking setting and the next turn in the accessible name', () => {
    const full = accessPill({
      kind: 'harness',
      permission: FULL_NEVER,
      title: presetName(PRESETS, FULL_NEVER.sandbox),
    });
    expect(full).toMatchObject({ label: 'Full', tone: 'caution', icon: 'shieldAlert' });
    expect(accessPillLabel(full, true)).toBe('Access: Full access, never asks, applies next turn');
    const edits = accessPill({
      kind: 'harness',
      permission: EDITS_NEEDED,
      title: presetName(PRESETS, EDITS_NEEDED.sandbox),
    });
    expect(accessPillLabel(edits, false)).toBe('Access: Workspace write, asks when needed');
  });

  it('labels every native level with its short word', () => {
    const labels = (
      ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions', 'dontAsk'] as const
    ).map((mode) => accessPill({ kind: 'claude', mode }).label);
    expect(labels).toEqual(['Ask', 'Edits', 'Plan', 'Auto', 'Full', 'Strict']);
    expect(accessPill({ kind: 'claude', mode: undefined }).label).toBe('Runtime');
    expect(
      accessPill({
        kind: 'codex',
        sandbox: { type: 'externalSandbox', networkAccess: 'restricted' },
        approval: 'never',
      }).label,
    ).toBe('Sandbox');
  });

  it('marks only full access with the caution icon on its row', () => {
    const rows = rowsOf(harnessSections(PRESETS, OFFERED, EDITS_NEEDED, 'W'));
    expect(rows.filter((row) => cautionIcon(row) !== null).map((row) => row.key)).toEqual([
      'access:danger-full-access',
    ]);
  });
});

describe('claude access', () => {
  it('selects the runtime default until a mode is set and blocks it for a live session', () => {
    const unset = claudeSections(claudeEngine({}).settings, false)[0]?.rows ?? [];
    expect(unset.find((row) => row.selected)?.option.value).toBe(RUNTIME_DEFAULT);
    const live =
      claudeSections(claudeEngine({ permission_mode: 'plan' }).settings, true)[0]?.rows ?? [];
    expect(live.find((row) => row.selected)?.option.value).toBe('plan');
    expect(live.find((row) => row.option.value === RUNTIME_DEFAULT)?.unavailable).not.toBeNull();
    expect(live.filter((row) => row.unavailable !== null)).toHaveLength(1);
  });

  it('parses modes and removes the mode for the runtime default', () => {
    expect(claudeMode('acceptEdits')).toBe('acceptEdits');
    expect(claudeMode(RUNTIME_DEFAULT)).toBe(RUNTIME_DEFAULT);
    expect(claudeMode('nonsense')).toBeNull();
    const engine = claudeEngine({ permission_mode: 'plan' });
    const reset = withClaudeMode(engine, RUNTIME_DEFAULT);
    expect(reset.kind === 'claude' && reset.settings.permission_mode).toBeUndefined();
    expect(withClaudeMode(engine, 'auto')).toMatchObject({ settings: { permission_mode: 'auto' } });
  });
});

describe('claude change routing', () => {
  const engine = claudeEngine({ permission_mode: 'plan' });

  it('edits the engine settings when no session is live', () => {
    expect(claudeChange(engine, false, 'auto')).toMatchObject({
      kind: 'engine',
      engine: { settings: { permission_mode: 'auto' } },
    });
    const reset = claudeChange(engine, false, RUNTIME_DEFAULT);
    expect(reset?.kind === 'engine' && reset.engine.kind === 'claude').toBe(true);
    expect(
      reset?.kind === 'engine' && reset.engine.kind === 'claude'
        ? reset.engine.settings.permission_mode
        : 'unset',
    ).toBeUndefined();
  });

  it('sends the mode to the running session and ignores the runtime default there', () => {
    expect(claudeChange(engine, true, 'acceptEdits')).toEqual({
      kind: 'live',
      mode: 'acceptEdits',
    });
    expect(claudeChange(engine, true, RUNTIME_DEFAULT)).toBeNull();
  });

  it('rejects a value that is not a mode', () => {
    expect(claudeChange(engine, false, 'nonsense')).toBeNull();
    expect(claudeChange(engine, true, 'nonsense')).toBeNull();
  });
});

describe('codex access', () => {
  const engine = codexEngine({
    sandbox_policy: { type: 'readOnly', networkAccess: false },
    approval_policy: 'untrusted',
  });

  it('offers every row while idle and selects the current pair', () => {
    const sections = codexSections(engine, false);
    expect(sections.flatMap((section) => section.rows.map((row) => row.unavailable))).toEqual(
      Array.from({ length: 9 }, () => null),
    );
    const selected = sections.flatMap((section) =>
      section.rows.filter((row) => row.selected).map((row) => row.key),
    );
    expect(selected).toEqual(['access:readOnly', 'approvals:untrusted']);
  });

  it('applies a change and refuses the ones a working turn cannot take', () => {
    expect(codexChange(engine, false, 'approvals', 'never')?.approval_policy).toBe('never');
    expect(codexChange(engine, false, 'approvals', RUNTIME_DEFAULT)).toEqual({
      sandbox_policy: { type: 'readOnly', networkAccess: false },
    });
    expect(codexChange(engine, false, 'access', 'unknown')).toBeNull();
    const rows = codexSections(engine, true).flatMap((section) => section.rows);
    expect(rows.some((row) => row.unavailable === WORKING_REASON)).toBe(true);
    expect(codexChange(engine, true, 'access', 'dangerFullAccess')).not.toBeNull();
  });
});
