import type { Engine } from './ai-chats';
import type { CodexProviderOptions } from './codex';
import { jsonEquals } from './comparison';
import { JSON_VALUE } from './values';

type Sandbox = CodexProviderOptions['sandbox_policy'];
export function isCodexPermissionOnlyChange(before: Engine, after: Engine): boolean {
  if (before.kind !== 'codex' || after.kind !== 'codex') return false;
  const { settings: beforeSettings, ...beforeBinding } = before;
  const { settings: afterSettings, ...afterBinding } = after;
  return (
    jsonEquals(beforeBinding, afterBinding) &&
    jsonEquals(nonPermissionSettings(beforeSettings), nonPermissionSettings(afterSettings)) &&
    sandboxFieldsRetained(beforeSettings.sandbox_policy, afterSettings.sandbox_policy)
  );
}
function nonPermissionSettings(
  settings: CodexProviderOptions,
): ReturnType<typeof JSON_VALUE.parse> {
  const { approval_policy: _approval, sandbox_policy: _sandbox, ...remaining } = settings;
  return JSON_VALUE.parse(remaining);
}
function sandboxFieldsRetained(before: Sandbox, after: Sandbox): boolean {
  if (before?.type === after?.type)
    return jsonEquals(JSON_VALUE.parse(before ?? null), JSON_VALUE.parse(after ?? null));
  if (after === undefined || after.type === 'dangerFullAccess') return true;
  if (after.type === 'workspaceWrite' && !defaultWorkspaceFields(after)) return false;
  return networkFieldsRetained(before, after);
}
function networkFieldsRetained(
  before: Sandbox,
  after: Exclude<NonNullable<Sandbox>, { type: 'dangerFullAccess' }>,
): boolean {
  const previousNetwork =
    before !== undefined && 'networkAccess' in before ? before.networkAccess : null;
  if (previousNetwork !== null) return previousNetwork === after.networkAccess;
  return after.networkAccess === false || after.networkAccess === 'restricted';
}
function defaultWorkspaceFields(
  policy: Extract<NonNullable<Sandbox>, { type: 'workspaceWrite' }>,
): boolean {
  return policy.writableRoots.length === 0 && policy.excludeTmpdirEnvVar && policy.excludeSlashTmp;
}
