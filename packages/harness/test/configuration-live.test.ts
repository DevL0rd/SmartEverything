import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  desiredHarnessConfiguration,
  installedHarnessBuiltins,
  HARNESS_SKILLS_PACKAGE,
} from '../src';
import { bootRuntime, statuses, streamedText, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

const SKILLS = desiredHarnessConfiguration().entries.filter(
  (entry) => entry.package === HARNESS_SKILLS_PACKAGE,
);
const OFF = {
  revision: 'skills-off',
  entries: SKILLS.map((entry) => ({ ...entry, enabled: false })),
};

async function booted(pending: string[] = []): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    desiredConfiguration: { revision: 'skills-on', entries: SKILLS },
    installedPlugins: (host) =>
      installedHarnessBuiltins(host).filter((plugin) => plugin.package === HARNESS_SKILLS_PACKAGE),
    configurationPending: (revision) => {
      pending.push(revision);
    },
  });
  return fixture;
}

describe('a changed skill or plugin configuration', () => {
  it('applies at once while an idle chat stays open and keeps working', async () => {
    const host = await booted();
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    await host.runtime.configure(OFF);

    expect(host.runtime.configurationState()).toMatchObject({
      revision: 'skills-off',
      pendingRevision: null,
    });
    expect(host.runtime.get(options.sessionId)).toBe(session);
    host.model.script({ kind: 'text', text: 'still here' });
    session.text('hello');
    await turnsFinished(host, session, 1);
    expect(streamedText(host.events)).toBe('still here');
  });

  it('waits for a running turn, reports it pending, then applies without closing the chat', async () => {
    const pending: string[] = [];
    const host = await booted(pending);
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);
    host.model.script({ kind: 'hang' });
    session.text('work');
    await vi.waitFor(() => {
      expect(statuses(host.events)).toContain('running');
    });

    await host.runtime.configure(OFF);

    expect(host.runtime.configurationState().pendingRevision).toBe('skills-off');
    expect(pending).toStrictEqual(['skills-off']);
    await session.interrupt();
    await vi.waitFor(() => {
      expect(host.runtime.configurationState()).toMatchObject({
        revision: 'skills-off',
        pendingRevision: null,
      });
    });
    expect(host.runtime.get(options.sessionId)).toBe(session);
  });

  it('applies by itself when the running turn ends on its own', async () => {
    const host = await booted();
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    host.model.script({ kind: 'text', text: 'done', after: finished });
    session.text('work');
    await vi.waitFor(() => {
      expect(statuses(host.events)).toContain('running');
    });
    await host.runtime.configure(OFF);
    expect(host.runtime.configurationState().pendingRevision).toBe('skills-off');

    finish();

    await vi.waitFor(() => {
      expect(host.runtime.configurationState()).toMatchObject({
        revision: 'skills-off',
        pendingRevision: null,
      });
    });
    expect(host.runtime.get(options.sessionId)).toBe(session);
  });

  it('lets a new chat open on the pending configuration while another chat is working', async () => {
    const host = await booted();
    const busy = await host.runtime.create(host.sessionOptions());
    host.model.script({ kind: 'hang' });
    busy.text('work');
    await vi.waitFor(() => {
      expect(statuses(host.events)).toContain('running');
    });
    await host.runtime.configure(OFF);

    const fresh = host.sessionOptions();
    const opened = await host.runtime.create(fresh);

    expect(opened).toBeDefined();
    expect(host.runtime.configurationState().pendingRevision).toBe('skills-off');
    await busy.interrupt();
  });
});
