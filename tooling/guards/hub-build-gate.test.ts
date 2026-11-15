import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import type { HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { HubBuildSourceError, requireAnyHubSource, requireHubSource } from '../hub-build-gate.ts';

const ARTIFACTS = ['hub', 'ui', 'apk', 'desktop'] as const;
const KINDS = ['hub', 'ui', 'app', 'desktop'] as const;

let scratch: string;

async function layoutOf(
  sources: Readonly<Record<(typeof ARTIFACTS)[number], string>>,
): Promise<HubLayout> {
  const layout = await testLayout(scratch);
  mkdirSync(dirname(layout.system.database.file), { recursive: true });
  const database = new DatabaseSync(layout.system.database.file);
  database.exec(
    'create table ai_settings (key text primary key, settings text not null, updated_at text not null)',
  );
  for (const artifact of ARTIFACTS)
    database
      .prepare('insert into ai_settings values (?, ?, ?)')
      .run(
        `updates.buildSource.${artifact}`,
        JSON.stringify({ source: sources[artifact] }),
        '2026-11-14T00:00:00.000Z',
      );
  database.close();
  return layout;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'hub-build-gate-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('requireHubSource', () => {
  it.each(KINDS)('refuses %s when the source is provided and settles the job', async (kind) => {
    const layout = await layoutOf({
      hub: 'provided',
      ui: 'provided',
      apk: 'provided',
      desktop: 'provided',
    });
    const settled: string[] = [];
    expect(() => {
      requireHubSource(layout, kind, (error) => settled.push(error.message));
    }).toThrow(HubBuildSourceError);
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatch(/build source is provided, not hub\..*provision-build-host/u);
  });

  it('refuses a github source', async () => {
    const layout = await layoutOf({
      hub: 'github',
      ui: 'github',
      apk: 'github',
      desktop: 'github',
    });
    expect(() => {
      requireHubSource(layout, 'app');
    }).toThrow(/build source is github/u);
  });

  it('lets only the artifact whose source is hub through', async () => {
    const layout = await layoutOf({
      hub: 'provided',
      ui: 'hub',
      apk: 'provided',
      desktop: 'provided',
    });
    expect(() => {
      requireHubSource(layout, 'ui');
    }).not.toThrow();
    expect(() => {
      requireHubSource(layout, 'hub');
    }).toThrow(HubBuildSourceError);
    expect(() => {
      requireHubSource(layout, 'app');
    }).toThrow(HubBuildSourceError);
  });
});

describe('requireAnyHubSource', () => {
  it('refuses the push plan when no artifact builds on the Hub', async () => {
    const layout = await layoutOf({
      hub: 'provided',
      ui: 'github',
      apk: 'provided',
      desktop: 'provided',
    });
    expect(() => {
      requireAnyHubSource(layout, KINDS);
    }).toThrow(/No artifact has the build source hub/u);
  });

  it('allows it when one artifact builds on the Hub', async () => {
    const layout = await layoutOf({
      hub: 'provided',
      ui: 'provided',
      apk: 'provided',
      desktop: 'hub',
    });
    expect(() => {
      requireAnyHubSource(layout, KINDS);
    }).not.toThrow();
  });
});
