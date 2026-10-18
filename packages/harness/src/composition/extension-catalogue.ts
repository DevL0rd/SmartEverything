import {
  HARNESS_EXTENSION_ITEM,
  HARNESS_BUNDLED_SKILL,
  type AiHarnessExtensions,
  type HarnessExtensionItem,
} from '@smarteverything/domain';
import { desiredHarnessConfiguration, type HarnessBuiltinSelection } from './builtins';
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
      name: 'Skills',
      description:
        'Use the skills installed on the Home Hub, in your folders and in each workspace.',
      capabilities: [
        'Discover workspace, user and installed skills',
        'Load skill instructions and their resource files',
      ],
      requirements: ['Installed skills reach every machine from the Home Hub'],
    },
  ],
  [
    'browser',
    {
      name: 'Headless browser',
      description: 'Inspect pages, take screenshots and test websites on the execution computer.',
      capabilities: [
        'Use Playwright browser tools in an isolated browser for each live session',
        'Inspect page accessibility snapshots and take screenshots',
        'Navigate and interact with authorized websites and development pages',
      ],
      requirements: [
        'Requires an installed Chromium browser on a local Linux execution computer',
        'Asks before each browser action unless the chat has Full access',
        'Browser state stays on its originating host and ends when the live session closes',
        'Unavailable on the hub, macOS and Windows runtimes',
      ],
    },
  ],
  [
    'claude-plugins',
    {
      name: 'Plugins',
      description: 'Use the agents, commands, skills, hooks and MCP servers of installed plugins.',
      capabilities: [
        'Load plugin skills, commands and agents',
        'Run the hooks and MCP servers of plugins the owner confirmed',
      ],
      requirements: ['Installed plugins reach every machine from the Home Hub'],
    },
  ],
]);

export function includedHarnessExtension(
  id: string,
  selection: HarnessBuiltinSelection,
): HarnessExtensionItem {
  const presentation = INCLUDED_PRESENTATIONS.get(id);
  const entry = desiredHarnessConfiguration().entries.find((candidate) => candidate.id === id);
  if (presentation === undefined || entry?.metadata === undefined)
    throw new Error(`Built-in extension ${id} has no registered presentation.`);
  return HARNESS_EXTENSION_ITEM.parse({
    id,
    kind: 'builtin',
    ...presentation,
    publisher: 'SmartEverything',
    license: null,
    platforms: entry.metadata.platforms,
    enabled: selection.enabled,
    config: selection.config,
    source: { kind: 'included' },
    version: entry.version,
    executes: false,
    confirmed: false,
  });
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
