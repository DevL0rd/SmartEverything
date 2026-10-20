import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/ai-chats';
import type { CodexProviderOptions } from '../src/codex';
import { isCodexPermissionOnlyChange } from '../src/codex-permission-change';

const DEVICE = '11111111-1111-4111-8111-111111111111';

type CodexEngine = Extract<Engine, { kind: 'codex' }>;
type WorkspaceSandbox = Extract<
  NonNullable<CodexProviderOptions['sandbox_policy']>,
  { type: 'workspaceWrite' }
>;

function codex(settings: CodexProviderOptions, model = 'gpt-test'): CodexEngine {
  return { kind: 'codex', device_id: DEVICE, model, effort: null, settings };
}

const OPENROUTER: Engine = { kind: 'openrouter', model: null, effort: null };

const READ_ONLY = { type: 'readOnly', networkAccess: false } as const;
const READ_ONLY_ONLINE = { type: 'readOnly', networkAccess: true } as const;
const FULL = { type: 'dangerFullAccess' } as const;
const WORKSPACE: WorkspaceSandbox = {
  type: 'workspaceWrite',
  writableRoots: [],
  networkAccess: false,
  excludeTmpdirEnvVar: true,
  excludeSlashTmp: true,
};

function permissionOnly(before: CodexProviderOptions, after: CodexProviderOptions): boolean {
  return isCodexPermissionOnlyChange(codex(before), codex(after));
}

describe('a change that touches only permissions', () => {
  it('is not one when either side is not a Codex chat', () => {
    expect(isCodexPermissionOnlyChange(OPENROUTER, codex({}))).toBe(false);
    expect(isCodexPermissionOnlyChange(codex({}), OPENROUTER)).toBe(false);
  });

  it('is one when nothing changed at all', () => {
    expect(permissionOnly({ sandbox_policy: READ_ONLY }, { sandbox_policy: READ_ONLY })).toBe(true);
  });

  it('is not one when the model or the machine changed', () => {
    expect(isCodexPermissionOnlyChange(codex({}, 'a'), codex({}, 'b'))).toBe(false);
    expect(
      isCodexPermissionOnlyChange(codex({}), {
        ...codex({}),
        device_id: '22222222-2222-4222-8222-222222222222',
      }),
    ).toBe(false);
  });

  it('is one when only the approval policy changed', () => {
    expect(permissionOnly({ approval_policy: 'never' }, { approval_policy: 'untrusted' })).toBe(
      true,
    );
  });

  it('is not one when a setting that is not a permission changed too', () => {
    expect(
      permissionOnly(
        { cwd: '/a', approval_policy: 'never' },
        { cwd: '/b', approval_policy: 'never' },
      ),
    ).toBe(false);
    expect(permissionOnly({}, { service_tier: 'fast' })).toBe(false);
  });

  it('is not one when the sandbox kept its kind but changed its fields', () => {
    expect(
      permissionOnly({ sandbox_policy: READ_ONLY }, { sandbox_policy: READ_ONLY_ONLINE }),
    ).toBe(false);
  });

  it('is one when the sandbox is lifted or removed entirely', () => {
    expect(permissionOnly({ sandbox_policy: READ_ONLY }, { sandbox_policy: FULL })).toBe(true);
    expect(permissionOnly({ sandbox_policy: READ_ONLY }, {})).toBe(true);
  });

  it('is one when a new sandbox does not open the network that was closed', () => {
    expect(permissionOnly({}, { sandbox_policy: READ_ONLY })).toBe(true);
    expect(
      permissionOnly(
        {},
        { sandbox_policy: { type: 'externalSandbox', networkAccess: 'restricted' } },
      ),
    ).toBe(true);
    expect(permissionOnly({ sandbox_policy: FULL }, { sandbox_policy: READ_ONLY })).toBe(true);
  });

  it('is not one when a new sandbox opens the network that had no setting before', () => {
    expect(permissionOnly({}, { sandbox_policy: READ_ONLY_ONLINE })).toBe(false);
    expect(permissionOnly({ sandbox_policy: FULL }, { sandbox_policy: READ_ONLY_ONLINE })).toBe(
      false,
    );
    expect(
      permissionOnly({}, { sandbox_policy: { type: 'externalSandbox', networkAccess: 'enabled' } }),
    ).toBe(false);
  });

  it('keeps the network setting the old sandbox had', () => {
    expect(
      permissionOnly(
        { sandbox_policy: READ_ONLY_ONLINE },
        { sandbox_policy: { ...WORKSPACE, networkAccess: true } },
      ),
    ).toBe(true);
    expect(
      permissionOnly({ sandbox_policy: READ_ONLY_ONLINE }, { sandbox_policy: WORKSPACE }),
    ).toBe(false);
    expect(
      permissionOnly(
        { sandbox_policy: { type: 'externalSandbox', networkAccess: 'enabled' } },
        { sandbox_policy: READ_ONLY_ONLINE },
      ),
    ).toBe(false);
  });

  it('is not one when a workspace sandbox adds folders or shares temporary directories', () => {
    expect(permissionOnly({ sandbox_policy: READ_ONLY }, { sandbox_policy: WORKSPACE })).toBe(true);
    expect(
      permissionOnly(
        { sandbox_policy: READ_ONLY },
        { sandbox_policy: { ...WORKSPACE, writableRoots: ['/data'] } },
      ),
    ).toBe(false);
    expect(
      permissionOnly(
        { sandbox_policy: READ_ONLY },
        { sandbox_policy: { ...WORKSPACE, excludeTmpdirEnvVar: false } },
      ),
    ).toBe(false);
    expect(
      permissionOnly(
        { sandbox_policy: READ_ONLY },
        { sandbox_policy: { ...WORKSPACE, excludeSlashTmp: false } },
      ),
    ).toBe(false);
  });
});
