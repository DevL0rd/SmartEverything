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

function slowCleanup(
  plugin: InstalledHarnessPlugin,
  release: Promise<void>,
): InstalledHarnessPlugin {
  const { resolve } = plugin;
  return {
    ...plugin,
    ...(resolve === undefined
      ? {}
      : {
          resolve: async (entry): Promise<InstalledHarnessPlugin> =>
            slowCleanup(await resolve(entry), release),
        }),
    mount: async (ctx, config): ReturnType<InstalledHarnessPlugin['mount']> => {
      const mounted = await plugin.mount(ctx, config);
      return {
        dispose: async (): Promise<void> => {
          await release;
          await mounted.dispose();
        },
      };
    },
  };
}

describe('opening a chat while the configuration is being applied', () => {
  it('waits for the in-flight reconcile instead of failing', async () => {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const skills = desiredHarnessConfiguration().entries.filter(
      (entry) => entry.package === HARNESS_SKILLS_PACKAGE,
    );
    fixture = await bootRuntime({
      desiredConfiguration: { revision: 'skills-on', entries: skills },
      installedPlugins: (host) =>
        installedHarnessBuiltins(host)
          .filter((plugin) => plugin.package === HARNESS_SKILLS_PACKAGE)
          .map((plugin) => slowCleanup(plugin, released)),
    });
    const host = fixture;

    const reconcile = host.runtime.configure({
      revision: 'skills-off',
      entries: skills.map((entry) => ({ ...entry, enabled: false })),
    });
    const options = host.sessionOptions();
    const opened = host.runtime.create(options);
    release();

    await reconcile;
    const session = await opened;
    expect(session).toBeDefined();
    expect(host.runtime.configurationState().pendingRevision).toBeNull();
    await host.runtime.close(options.sessionId);
  });
});
