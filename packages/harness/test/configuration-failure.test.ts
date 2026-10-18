import { afterEach, describe, expect, it } from 'vitest';
import {
  desiredHarnessConfiguration,
  installedHarnessBuiltins,
  HARNESS_SKILLS_PACKAGE,
} from '../src';
import type { InstalledHarnessPlugin } from '../src/composition/configuration';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function refusingCleanup(plugin: InstalledHarnessPlugin): InstalledHarnessPlugin {
  const { resolve } = plugin;
  let refused = false;
  return {
    ...plugin,
    ...(resolve === undefined
      ? {}
      : {
          resolve: async (entry): Promise<InstalledHarnessPlugin> =>
            refusingCleanup(await resolve(entry)),
        }),
    mount: async (ctx, config): ReturnType<InstalledHarnessPlugin['mount']> => {
      const mounted = await plugin.mount(ctx, config);
      return {
        dispose: async (): Promise<void> => {
          await mounted.dispose();
          if (refused) return;
          refused = true;
          throw new Error('The skills cleanup was refused.');
        },
      };
    },
  };
}

describe('applying a changed configuration that cannot be applied', () => {
  it('reports it on the configuration channel and keeps it pending', async () => {
    const pendingReports: string[] = [];
    const skills = desiredHarnessConfiguration().entries.filter(
      (entry) => entry.package === HARNESS_SKILLS_PACKAGE,
    );
    fixture = await bootRuntime({
      desiredConfiguration: { revision: 'skills-on', entries: skills },
      installedPlugins: (host) =>
        installedHarnessBuiltins(host)
          .filter((plugin) => plugin.package === HARNESS_SKILLS_PACKAGE)
          .map(refusingCleanup),
      configurationPending: (revision) => {
        pendingReports.push(revision);
      },
    });
    const host = fixture;
    const options = host.sessionOptions();
    await host.runtime.create(options);

    await expect(
      host.runtime.configure({
        revision: 'skills-off',
        entries: skills.map((entry) => ({ ...entry, enabled: false })),
      }),
    ).rejects.toThrow('The skills cleanup was refused.');

    const state = host.runtime.configurationState();
    expect(pendingReports.at(-1)).toBe('skills-off');
    expect(state.pendingRevision).toBe('skills-off');
    expect(state.readiness.map((entry) => [entry.state, entry.reason])).toStrictEqual([
      ['failed', 'The skills cleanup was refused.'],
    ]);
  });
});
