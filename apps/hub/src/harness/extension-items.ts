import { HARNESS_EXTENSION_ITEM, type HarnessExtensionItem } from '@smarteverything/domain';
import type { HarnessBuiltinSelection } from '@smarteverything/harness';
import type { StoredExtension } from '../store/repositories/harness-extensions';

const PLATFORMS = ['linux', 'macos', 'windows'] as const;

export function builtinSelection(
  stored: Readonly<Record<string, HarnessBuiltinSelection>>,
  id: string,
): HarnessBuiltinSelection {
  return stored[id] ?? { enabled: true, config: {} };
}

export function publisherOf(url: string): string {
  const github = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/u.exec(url);
  if (github?.[1] !== undefined) return github[1];
  return URL.canParse(url) ? new URL(url).hostname : url;
}

export function extensionItem(row: StoredExtension): HarnessExtensionItem {
  return HARNESS_EXTENSION_ITEM.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    publisher: row.publisher,
    license: row.license,
    capabilities:
      row.kind === 'skill'
        ? ['Load the skill instructions and their resource files']
        : [
            'Use the plugin skills, commands and agents',
            ...(row.executes ? ['Run its hooks and MCP servers once you confirm it'] : []),
          ],
    requirements: row.executes ? [] : ['Installing does not grant file, shell or account access'],
    platforms: PLATFORMS,
    enabled: row.enabled,
    config: {},
    source: row.source,
    version: row.version,
    executes: row.executes,
    confirmed: row.confirmed,
  });
}
