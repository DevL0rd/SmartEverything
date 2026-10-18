import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { AI_REFERENCE_SEARCH } from '@smarteverything/domain';
import type { AiMessageReference } from '@smarteverything/domain';
import {
  desiredHarnessConfiguration,
  installedHarnessBuiltins,
  HARNESS_SKILLS_PACKAGE,
} from '../src';
import { referencePromptSource } from '../src/references/prompt';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function writeSkill(workspace: string, name: string, body: string): Promise<void> {
  const directory = join(workspace, '.agents', 'skills', name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Keeps notes for ${name}.\n---\n\n${body}\n`,
  );
}

async function deviceWithSkills(codexSourced: readonly string[] = []): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    mount: (ctx) => {
      ctx.inject(['skills'], (active: Context): void => {
        for (const name of codexSourced)
          active.skills.register({
            name,
            description: `Helps with ${name}.`,
            source: 'user-codex',
            invocation: { modelInvocable: true, userInvocable: true },
            content: 'Review the change.',
          });
      });
    },
    desiredConfiguration: {
      revision: 'skills-only',
      entries: desiredHarnessConfiguration().entries.filter(
        (entry) => entry.package === HARNESS_SKILLS_PACKAGE,
      ),
    },
    installedPlugins: (host) =>
      installedHarnessBuiltins(host).filter((plugin) => plugin.package === HARNESS_SKILLS_PACKAGE),
  });
  return fixture;
}

async function selectSkill(
  host: RuntimeFixture,
  id: string,
  name: string,
): Promise<AiMessageReference> {
  const found = await host.runtime.referenceOperation(id, {
    action: 'search',
    search: AI_REFERENCE_SEARCH.parse({ kinds: ['skill'], query: name }),
  });
  const item = found.items.find((entry) => entry.label === name);
  if (item === undefined) throw new Error(`The skill ${name} was not listed.`);
  const token = `@${name}`;
  return { reference: item.reference, label: name, token, start: 0, end: token.length };
}

describe('selecting a skill with @', () => {
  it('lists a skill whose source name merely contains codex', async () => {
    const host = await deviceWithSkills(['review-helper']);
    const options = host.sessionOptions();
    await host.runtime.create(options);

    const found = await host.runtime.referenceOperation(options.sessionId, {
      action: 'search',
      search: AI_REFERENCE_SEARCH.parse({ kinds: ['skill'], query: 'review-helper' }),
    });

    expect(found.items.map((item) => item.label)).toStrictEqual(['review-helper']);
  });

  it('returns skills and folder files from one search over several kinds', async () => {
    const host = await deviceWithSkills();
    await writeSkill(host.workspace, 'note-taker', 'Write every note as one bullet.');
    await writeFile(join(host.workspace, 'note-taker.md'), 'notes');
    const options = host.sessionOptions();
    await host.runtime.create(options);

    const found = await host.runtime.referenceOperation(options.sessionId, {
      action: 'search',
      search: AI_REFERENCE_SEARCH.parse({ kinds: ['skill', 'device_path'], query: 'note-taker' }),
    });

    const kinds = new Set(found.items.map((item) => item.reference.kind));
    expect([...kinds].sort()).toStrictEqual(['device_path', 'skill']);
  });

  it('still sends the message after the skill was edited since it was selected', async () => {
    const host = await deviceWithSkills();
    await writeSkill(host.workspace, 'note-taker', 'Write every note as one bullet.');
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);
    const selected = await selectSkill(host, options.sessionId, 'note-taker');
    await writeSkill(host.workspace, 'note-taker', 'Write every note as a numbered list.');
    host.model.script({ kind: 'text', text: 'done' });

    session.prompt(
      createUserMessage({
        content: [{ type: 'text', text: '@note-taker take a note' }],
        source: referencePromptSource([selected]),
      }),
    );
    await turnsFinished(host, session, 1);

    const sent = spoken(host.model.requests[0]?.messages ?? []).map((message) => message.text);
    expect(sent.some((text) => text.includes('Write every note as a numbered list.'))).toBe(true);
  });

  it('refuses the message when the skill was removed since it was selected', async () => {
    const host = await deviceWithSkills();
    await writeSkill(host.workspace, 'note-taker', 'Write every note as one bullet.');
    const options = host.sessionOptions();
    await host.runtime.create(options);
    const selected = await selectSkill(host, options.sessionId, 'note-taker');
    await rm(join(host.workspace, '.agents', 'skills', 'note-taker'), { recursive: true });

    await vi.waitFor(async () => {
      await expect(
        host.runtime.resolveReferences(options.sessionId, [selected.reference]),
      ).rejects.toThrow(/no longer available/u);
    });
  });
});
