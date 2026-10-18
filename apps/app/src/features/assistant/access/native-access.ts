import {
  CLAUDE_SETTABLE_MODES,
  isCodexPermissionOnlyChange,
  type ClaudeProviderOptions,
  type CodexProviderOptions,
  type Engine,
} from '@smarteverything/domain';
import { sectionById, sectionView, type AccessSectionView } from './access-model';
import { RUNTIME_DEFAULT, accessSections } from './ai-access';

type ClaudeMode = NonNullable<ClaudeProviderOptions['permission_mode']>;
type ClaudeEngine = Extract<Engine, { kind: 'claude' }>;
type CodexEngine = Extract<Engine, { kind: 'codex' }>;
type Sandbox = NonNullable<CodexProviderOptions['sandbox_policy']>;

export const WORKING_REASON = 'Stop the reply to change this';
const CLAUDE_LIVE_REASON = 'Can’t be set while the session runs';

export function claudeSections(
  settings: ClaudeProviderOptions,
  live: boolean,
): readonly AccessSectionView[] {
  const mode = sectionById(accessSections('claude'), 'mode');
  return [
    sectionView(mode, settings.permission_mode ?? RUNTIME_DEFAULT, (option) =>
      live && option.value === RUNTIME_DEFAULT ? CLAUDE_LIVE_REASON : null,
    ),
  ];
}

export function claudeMode(value: string): ClaudeMode | typeof RUNTIME_DEFAULT | null {
  if (value === RUNTIME_DEFAULT) return RUNTIME_DEFAULT;
  return CLAUDE_SETTABLE_MODES.find((mode) => mode === value) ?? null;
}

export function withClaudeMode(
  engine: ClaudeEngine,
  mode: ClaudeMode | typeof RUNTIME_DEFAULT,
): Engine {
  if (mode === RUNTIME_DEFAULT) {
    const { permission_mode: _mode, ...settings } = engine.settings;
    return { ...engine, settings };
  }
  return { ...engine, settings: { ...engine.settings, permission_mode: mode } };
}

export type ClaudeChange =
  | { readonly kind: 'engine'; readonly engine: Engine }
  | { readonly kind: 'live'; readonly mode: ClaudeMode };

export function claudeChange(
  engine: ClaudeEngine,
  live: boolean,
  value: string,
): ClaudeChange | null {
  const mode = claudeMode(value);
  if (mode === null) return null;
  if (!live) return { kind: 'engine', engine: withClaudeMode(engine, mode) };
  return mode === RUNTIME_DEFAULT ? null : { kind: 'live', mode };
}

type CurrentSandbox = CodexProviderOptions['sandbox_policy'];

function readOnly(current: CurrentSandbox): Sandbox {
  return current?.type === 'readOnly' ? current : { type: 'readOnly', networkAccess: false };
}

function workspaceWrite(current: CurrentSandbox): Sandbox {
  if (current?.type === 'workspaceWrite') return current;
  return {
    type: 'workspaceWrite',
    writableRoots: [],
    networkAccess: false,
    excludeTmpdirEnvVar: true,
    excludeSlashTmp: true,
  };
}

function externalSandbox(current: CurrentSandbox): Sandbox {
  return current?.type === 'externalSandbox'
    ? current
    : { type: 'externalSandbox', networkAccess: 'restricted' };
}

const SANDBOXES: ReadonlyMap<string, (current: CurrentSandbox) => Sandbox> = new Map([
  ['readOnly', readOnly],
  ['workspaceWrite', workspaceWrite],
  ['dangerFullAccess', (): Sandbox => ({ type: 'dangerFullAccess' })],
  ['externalSandbox', externalSandbox],
]);

function codexSandbox(type: string, current: CurrentSandbox): Sandbox | null {
  return SANDBOXES.get(type)?.(current) ?? null;
}

const CODEX_APPROVALS = ['untrusted', 'on-request', 'never'] as const;

function codexSettings(
  settings: CodexProviderOptions,
  sectionId: string,
  value: string,
): CodexProviderOptions | null {
  if (sectionId === 'access') {
    const { sandbox_policy: _policy, ...rest } = settings;
    if (value === RUNTIME_DEFAULT) return rest;
    const sandbox = codexSandbox(value, settings.sandbox_policy);
    return sandbox === null ? null : { ...settings, sandbox_policy: sandbox };
  }
  const { approval_policy: _approval, ...rest } = settings;
  if (value === RUNTIME_DEFAULT) return rest;
  const approval = CODEX_APPROVALS.find((policy) => policy === value);
  return approval === undefined ? null : { ...settings, approval_policy: approval };
}

function codexSelected(settings: CodexProviderOptions, sectionId: string): string | null {
  if (sectionId === 'access') return settings.sandbox_policy?.type ?? RUNTIME_DEFAULT;
  const policy = settings.approval_policy;
  if (policy === undefined) return RUNTIME_DEFAULT;
  return typeof policy === 'string' ? policy : null;
}

export function codexChange(
  engine: CodexEngine,
  working: boolean,
  sectionId: string,
  value: string,
): CodexProviderOptions | null {
  const settings = codexSettings(engine.settings, sectionId, value);
  if (settings === null) return null;
  const locked = working && !isCodexPermissionOnlyChange(engine, { ...engine, settings });
  return locked ? null : settings;
}

export function codexSections(engine: CodexEngine, working: boolean): readonly AccessSectionView[] {
  return accessSections('codex').map((section) =>
    sectionView(section, codexSelected(engine.settings, section.id), (option) =>
      codexChange(engine, working, section.id, option.value) === null ? WORKING_REASON : null,
    ),
  );
}
