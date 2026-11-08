import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  HarnessDiscoveryReference,
  HarnessExtensionItem,
  HarnessExtensionSourceRequest,
} from '@smarteverything/domain';
import type { Rig } from '../assistant/harness/support/rig';

export const SKILL = (name: string, body: string): string =>
  `---\nname: ${name}\ndescription: ${name} instructions.\nlicense: MIT\n---\n\n${body}\n`;

export const MARKETPLACE = {
  '.claude-plugin/marketplace.json': JSON.stringify({
    name: 'fixture-market',
    owner: { name: 'Fixture Inc' },
    plugins: [
      { name: 'tools', description: 'Tools with hooks.', source: './plugins/tools' },
      { name: 'notes', description: 'Notes only.', source: './plugins/notes', license: 'MIT' },
    ],
  }),
  'plugins/tools/.claude-plugin/plugin.json': JSON.stringify({ name: 'tools' }),
  'plugins/tools/hooks/hooks.json': JSON.stringify({ hooks: {} }),
  'plugins/tools/skills/lint/SKILL.md': SKILL('lint', 'Run the linter.'),
  'plugins/notes/skills/note/SKILL.md': SKILL('note', 'Write short notes.'),
  'skills/standalone/SKILL.md': SKILL('standalone', 'Stand alone.'),
};

export class GitFixture {
  constructor(readonly repository: string) {}

  async put(files: Readonly<Record<string, string>>): Promise<void> {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(this.repository, path)), { recursive: true });
      await writeFile(join(this.repository, path), content);
    }
  }

  git(...args: string[]): string {
    return execFileSync(
      'git',
      [
        '-C',
        this.repository,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        ...args,
      ],
      { stdio: 'pipe', encoding: 'utf8' },
    );
  }

  async commit(files: Readonly<Record<string, string>>): Promise<void> {
    await this.put(files);
    this.git('init', '--quiet');
    this.git('add', '-A');
    this.git('commit', '--quiet', '-m', 'fixture');
  }

  async change(files: Readonly<Record<string, string>>): Promise<void> {
    await this.put(files);
    this.git('add', '-A');
    this.git('commit', '--quiet', '-m', 'edit');
  }

  head(): string {
    return this.git('rev-parse', 'HEAD').trim();
  }
}

export async function referenceOf(
  rig: Rig,
  id: string,
  source: HarnessExtensionSourceRequest,
): Promise<HarnessDiscoveryReference> {
  const page = await rig.service.discovery.browse({ source, refresh: true, query: '' });
  const found = page.items.find((item) => item.id === id);
  if (found === undefined) throw new Error(`Discovery did not offer ${id}.`);
  return found.reference;
}

export async function installOne(
  rig: Rig,
  reference: HarnessDiscoveryReference,
  confirm = false,
): Promise<HarnessExtensionItem> {
  const { results } = await rig.service.extensions.install({
    items: [reference],
    confirm_executes: confirm,
  });
  const [result] = results;
  if (result === undefined) throw new Error('Install returned no result.');
  if (!result.ok) throw new Error(result.error.message);
  return result.item;
}
