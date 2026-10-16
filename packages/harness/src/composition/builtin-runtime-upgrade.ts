import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { HarnessDesiredConfiguration, HarnessDesiredEntry } from './configuration';
import {
  HARNESS_BROWSER_METADATA,
  HARNESS_RUNTIME_REVISION,
  HARNESS_SKILLS_METADATA,
} from './builtin-metadata';
import { HARNESS_CLAUDE_PLUGINS_METADATA } from './claude-plugin-metadata';

const METADATA = [
  { package: '@smarteverything/harness-browser', metadata: HARNESS_BROWSER_METADATA },
  { package: '@smarteverything/harness-skills', metadata: HARNESS_SKILLS_METADATA },
  { package: '@smarteverything/harness-claude-plugins', metadata: HARNESS_CLAUDE_PLUGINS_METADATA },
] as const;

export function upgradeBuiltinRuntimeMetadata(
  current: HarnessDesiredConfiguration,
): HarnessDesiredConfiguration {
  const entries = current.entries.map(upgradeEntry);
  if (entries.every((entry, index) => entry === current.entries[index])) return current;
  return {
    revision: `native-composition-${createHash('sha256')
      .update(JSON.stringify({ previous: current.revision, entries }))
      .digest('hex')}`,
    entries,
  };
}

function upgradeEntry(entry: HarnessDesiredEntry): HarnessDesiredEntry {
  const known = METADATA.find(
    (item) => item.package === entry.package && item.metadata.adapter.version === entry.version,
  );
  if (known === undefined || entry.metadata === undefined) return entry;
  const metadata = { ...known.metadata, skill_assets: entry.metadata.skill_assets };
  if (
    !isDeepStrictEqual(entry.metadata, {
      ...metadata,
      runtime_version: HARNESS_RUNTIME_REVISION,
    })
  )
    return entry;
  return { ...entry, metadata };
}
