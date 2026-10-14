import {
  HARNESS_EXTENSION_ITEM,
  HARNESS_BUNDLED_SKILL,
  type AiHarnessExtensions,
  HARNESS_SKILL_SOURCE_URL,
  type HarnessExtensionItem,
  type HarnessSkillAsset,
  type HarnessSkillPresentation,
} from '@smarteverything/domain';
import { defaultHarnessBuiltins } from './builtins';
import { PRODUCT_SKILLS } from './product-skill-catalogue';

const INCLUDED_PRESENTATIONS = new Map([
  [
    'codegraph',
    {
      name: 'Workspace indexer',
      description: 'Understand files, symbols and references in a workspace.',
      capabilities: [
        'Search workspace files, symbols and references',
        'Maintain a local workspace index',
      ],
      requirements: ['Runs in a local Linux workspace', 'File access stays on each device'],
    },
  ],
  [
    'skills',
    {
      name: 'Workspace skills',
      description: 'Discover and use skills available in each workspace.',
      capabilities: [
        'Discover local workspace and user skills',
        'Load shared immutable skill instructions and bundled resources',
      ],
      requirements: ['Runs in a local Linux workspace', 'File access stays on each device'],
    },
  ],
  [
    'browser',
    {
      name: 'Headless browser',
      description: 'Inspect pages, take screenshots and test websites on the execution computer.',
      capabilities: [
        'Use official DSH Playwright MCP tools in an isolated browser for each live session',
        'Inspect page accessibility snapshots and take screenshots',
        'Navigate and interact with authorized websites and development pages',
      ],
      requirements: [
        'Requires an installed Chromium browser on a local Linux execution computer',
        'Requires current Full access because this provider cannot enforce a file or network sandbox',
        'Browser state stays on its originating host and ends when the live session closes',
        'Unavailable on the hub, macOS and Windows runtimes',
      ],
    },
  ],
]);

export function includedHarnessExtensions(): readonly HarnessExtensionItem[] {
  return defaultHarnessBuiltins().entries.map((entry) => {
    const presentation = INCLUDED_PRESENTATIONS.get(entry.id);
    if (presentation === undefined || entry.metadata === undefined)
      throw new Error('Included extension has no registered presentation or pinned metadata.');
    return HARNESS_EXTENSION_ITEM.parse({
      id: entry.id,
      kind: 'extension',
      included: true,
      ...presentation,
      publisher: 'SmartEverything',
      runtimes: ['smarteverything'],
      platforms: entry.metadata.platforms,
      selection: { kind: 'entry', entry },
      acquisition: { state: 'available', format: 'builtin' },
    });
  });
}

export function harnessSkillExtension(
  asset: HarnessSkillAsset,
  display?: HarnessSkillPresentation,
): HarnessExtensionItem {
  const sourceFormat =
    asset.source.kind === 'artifact' && new URL(asset.source.url).pathname.endsWith('SKILL.md')
      ? 'immutable-github-skill-v1'
      : 'immutable-json-skill-bundle-v1';
  return HARNESS_EXTENSION_ITEM.parse({
    id: `skill-asset:${asset.id}`,
    kind: 'skill',
    included: false,
    name: display?.name ?? asset.id,
    description: display?.description ?? 'Shared immutable skill included in Workspace skills.',
    publisher: display?.publisher ?? 'Imported source',
    capabilities: ['Load skill instructions and bundled resources through Workspace skills'],
    requirements: [
      'Requires Workspace skills on a local Linux device',
      'Installing does not grant file, shell or account access',
    ],
    runtimes: ['smarteverything'],
    platforms: ['linux'],
    selection: { kind: 'skill_asset', parent_id: 'skills', asset },
    acquisition: supportedSkillSource(asset)
      ? { state: 'available', format: sourceFormat }
      : {
          state: 'unsupported',
          reason: 'This pinned asset source has no supported public immutable acquisition adapter.',
        },
  });
}

function supportedSkillSource(asset: HarnessSkillAsset): boolean {
  return (
    asset.source.kind === 'artifact' && HARNESS_SKILL_SOURCE_URL.safeParse(asset.source.url).success
  );
}

export function bundledHarnessSkills(): NonNullable<AiHarnessExtensions['bundled_skills']> {
  return PRODUCT_SKILLS.skills.map((skill) =>
    HARNESS_BUNDLED_SKILL.parse({
      id: skill.name,
      kind: 'bundled_skill',
      name: bundledSkillTitle(skill),
      description: skill.description,
      publisher: 'SmartEverything',
      revision: PRODUCT_SKILLS.revision,
      content: skill.content,
    }),
  );
}

function bundledSkillTitle(skill: { readonly name: string; readonly content: string }): string {
  const title = /^#(?:[ \t]+([^\r\n]*))?$/mu.exec(skill.content)?.[1]?.trim();
  return title === undefined || title.length === 0 ? skill.name : title;
}
