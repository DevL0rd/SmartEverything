import { describe, expect, it } from 'vitest';
import { ENGINE, type AiHarnessPermission, type Engine } from '@smarteverything/domain';
type ClaudeEngine = Extract<Engine, { kind: 'claude' }>;
type CodexEngine = Extract<Engine, { kind: 'codex' }>;
import { cautionIcon, rowKey } from './access-model';
import { cloudModel } from './cloud-model';
import { accessPill, accessPillLabel, RUNTIME_DEFAULT } from './ai-access';
import {
  applyingKey,
  harnessBlock,
  harnessChoice,
  harnessSections,
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

function unavailable(
  sections: ReturnType<typeof harnessSections>,
  id: string,
): readonly (string | null)[] {
  return sections.find((section) => section.id === id)?.rows.map((row) => row.unavailable) ?? [];
}

describe('harnessSections', () => {
  it('marks the asking options the chosen reach does not offer', () => {
    const sections = harnessSections(OFFERED, FULL_NEVER, 'Workstation');
    expect(unavailable(sections, 'asking')).toEqual(['Not offered by Workstation', null]);
    expect(unavailable(harnessSections(OFFERED, EDITS_NEEDED, 'Workstation'), 'asking')).toEqual([
      null,
      'Not offered by Workstation',
    ]);
  });

  it('marks a reach the machine never offers and selects the current pair', () => {
    const sections = harnessSections([READ_ASK, EDITS_NEEDED], READ_ASK, 'Laptop');
    expect(unavailable(sections, 'access')).toEqual([null, null, 'Not offered by Laptop']);
    const chosen = sections.flatMap((section) => section.rows.filter((row) => row.selected));
    expect(chosen.map((row) => row.key)).toEqual(['access:read-only', 'asking:on-request']);
  });
});

describe('harnessChoice', () => {
  it('keeps the asking setting when the new reach supports it', () => {
    expect(harnessChoice(OFFERED, EDITS_NEEDED, 'access', 'read-only')).toEqual(READ_ASK);
  });

  it('falls to the first pair of the reach when the asking setting is not offered', () => {
    expect(harnessChoice(OFFERED, EDITS_NEEDED, 'access', 'danger-full-access')).toEqual(
      FULL_NEVER,
    );
  });

  it('refuses an asking option the current reach does not offer and the unchanged pair', () => {
    expect(harnessChoice(OFFERED, FULL_NEVER, 'asking', 'on-request')).toBeNull();
    expect(harnessChoice(OFFERED, EDITS_NEEDED, 'asking', 'on-request')).toBeNull();
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
    const full = accessPill({ kind: 'harness', permission: FULL_NEVER });
    expect(full).toMatchObject({ label: 'Full', tone: 'caution', icon: 'shieldAlert' });
    expect(accessPillLabel(full, true)).toBe('Access: Full access, never asks, applies next turn');
    const edits = accessPill({ kind: 'harness', permission: EDITS_NEEDED });
    expect(accessPillLabel(edits, false)).toBe('Access: Allow edits, asks when needed');
  });

  it('labels every native level with its short word', () => {
    const labels = (
      ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions', 'dontAsk'] as const
    ).map((mode) => accessPill({ kind: 'claude', mode }).label);
    expect(labels).toEqual(['Default', 'Edits', 'Plan', 'Auto', 'Full', 'Strict']);
    expect(accessPill({ kind: 'claude', mode: undefined }).label).toBe('Default');
    expect(
      accessPill({
        kind: 'codex',
        sandbox: { type: 'externalSandbox', networkAccess: 'restricted' },
        approval: 'never',
      }).label,
    ).toBe('Sandbox');
    expect(accessPill({ kind: 'cloud', allowedTools: 31 }).label).toBe('Tools 31');
  });

  it('marks only full access with the caution icon on its row', () => {
    const rows = harnessSections(OFFERED, EDITS_NEEDED, 'W').flatMap((section) => section.rows);
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

describe('cloud access', () => {
  it('offers no tools row for a draft chat', () => {
    expect(cloudModel(undefined).tools).toBeNull();
  });

  it('counts the allowed tools for a saved chat', () => {
    expect(cloudModel({ tools: null }).tools?.label).toMatch(/^Tools for this chat · \d+ of \d+$/);
  });
});
