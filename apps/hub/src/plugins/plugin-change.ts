import { ApiError, type JsonValue, type PluginRow } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { PluginSecrets } from './plugin-secrets';
import { checkedSecrets, splitSettings, type SettingsAuthor } from './plugin-settings';

export interface PluginChangeInput {
  readonly enabled?: boolean | undefined;
  readonly trusted?: boolean | undefined;
  readonly tool_switches?: Readonly<Record<string, boolean>> | undefined;
  readonly settings?: Readonly<Record<string, JsonValue>> | undefined;
  readonly secrets?: Readonly<Record<string, string>> | undefined;
  readonly author: SettingsAuthor;
}

export interface AppliedChange {
  readonly row: PluginRow;
  readonly restart: boolean;
  readonly live: boolean;
}

function restartNeeded(
  row: PluginRow,
  updated: PluginRow,
  settingsChanged: boolean,
  secretsChanged: boolean,
): boolean {
  if (updated.enabled !== row.enabled) {
    return true;
  }
  if (!updated.enabled) {
    return false;
  }
  return (
    updated.trusted !== row.trusted ||
    secretsChanged ||
    (settingsChanged && !changedKeysAreLive(row, updated))
  );
}

function changedKeysAreLive(row: PluginRow, updated: PluginRow): boolean {
  if (row.source !== 'builtin') {
    return false;
  }
  const declared = row.manifest.contributes.settings;
  return Object.keys(updated.settings)
    .filter((key) => JSON.stringify(updated.settings[key]) !== JSON.stringify(row.settings[key]))
    .every((key) => declared[key]?.live === true);
}

export interface ChangeDeps {
  readonly store: Store;
  readonly secrets: PluginSecrets;
  readonly validate: (
    row: PluginRow,
    settings: Readonly<Record<string, JsonValue>>,
  ) => string | null;
}

async function saveSecrets(
  deps: ChangeDeps,
  id: string,
  secrets: Readonly<Record<string, string>>,
): Promise<boolean> {
  const entries = Object.entries(secrets);
  const set = Object.fromEntries(entries.filter(([, value]) => value !== ''));
  if (Object.keys(set).length > 0) {
    await deps.secrets.set(id, set);
  }
  for (const [name] of entries.filter(([, value]) => value === '')) {
    await deps.secrets.remove(id, name);
  }
  return entries.length > 0;
}

function checkedSettings(
  row: PluginRow,
  change: PluginChangeInput,
  deps: ChangeDeps,
): ReturnType<typeof splitSettings> | null {
  if (change.settings === undefined && change.secrets === undefined) {
    return null;
  }
  const split = splitSettings(row, change.settings ?? {}, change.author);
  const reason = deps.validate(row, split.settings);
  if (reason !== null) {
    throw new ApiError('invalid_request', reason);
  }
  return {
    settings: split.settings,
    secrets: {
      ...split.secrets,
      ...checkedSecrets(row, change.secrets ?? {}, change.author),
    },
  };
}

export async function applyChange(
  row: PluginRow,
  change: PluginChangeInput,
  deps: ChangeDeps,
): Promise<AppliedChange> {
  const split = checkedSettings(row, change, deps);
  const secretsChanged = split === null ? false : await saveSecrets(deps, row.id, split.secrets);
  const updated = deps.store.plugins.update(row.id, {
    enabled: change.enabled,
    trusted: change.trusted,
    toolSwitches:
      change.tool_switches === undefined
        ? undefined
        : { ...row.tool_switches, ...change.tool_switches },
    settings: split?.settings,
    secretNames: deps.secrets.names(row.id),
  });
  const restart = restartNeeded(row, updated, split !== null, secretsChanged);
  return { row: updated, restart, live: split !== null && !restart && updated.enabled };
}
