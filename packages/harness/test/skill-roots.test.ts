import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  desiredHarnessConfiguration,
  HARNESS_SKILLS_PACKAGE,
  installedHarnessBuiltins,
} from '../src';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
let turns = 0;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
  turns = 0;
});

async function bootSkills(): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    desiredConfiguration: {
      ...desiredHarnessConfiguration(),
      entries: desiredHarnessConfiguration().entries.filter(
        (entry) => entry.package === HARNESS_SKILLS_PACKAGE,
      ),
    },
    installedPlugins: (host) =>
      installedHarnessBuiltins(host).filter((plugin) => plugin.package === HARNESS_SKILLS_PACKAGE),
  });
  return fixture;
}

async function writeSkill(root: string, name: string): Promise<void> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Skill ${name}.\nallowed-tools: Read\n---\n\nBody of ${name}.\n`,
  );
}

async function catalogueIn(host: RuntimeFixture, directory: string): Promise<string> {
  host.model.script({ kind: 'text', text: 'hi' });
  const session = await host.runtime.create({ ...host.sessionOptions(), directory });
  session.text('hello');
  turns += 1;
  await turnsFinished(host, session, turns);
  const request = host.model.requests.at(-1);
  return spoken(request?.messages ?? [])
    .map((message) => message.text)
    .filter((text) => text.includes('<available_skills>'))
    .join('\n');
}

describe('Claude skill folders', () => {
  it('reads the user skills in the home .claude folder', async () => {
    const host = await bootSkills();
    await writeSkill(join(host.workspace, '.claude/skills'), 'from-home');

    expect(await catalogueIn(host, host.workspace)).toContain('`from-home`');
  });

  it('reads the repository .claude folder from a subfolder of the repository', async () => {
    const host = await bootSkills();
    const repository = join(host.workspace, 'repository');
    const subfolder = join(repository, 'apps', 'hub');
    await mkdir(join(repository, '.git'), { recursive: true });
    await mkdir(subfolder, { recursive: true });
    await writeSkill(join(repository, '.claude/skills'), 'from-repository');
    await writeSkill(join(repository, '.agents/skills'), 'from-agents');

    const listed = await catalogueIn(host, subfolder);

    expect(listed).toContain('`from-repository`');
    expect(listed).toContain('`from-agents`');
  });

  it('lists a skill added after the first listing', async () => {
    const host = await bootSkills();
    await writeSkill(join(host.workspace, '.claude/skills'), 'already-there');
    expect(await catalogueIn(host, host.workspace)).not.toContain('`added-later`');

    await writeSkill(join(host.workspace, '.claude/skills'), 'added-later');

    await vi.waitFor(
      async () => {
        expect(await catalogueIn(host, host.workspace)).toContain('`added-later`');
      },
      { timeout: 8000, interval: 200 },
    );
  }, 15000);
});
