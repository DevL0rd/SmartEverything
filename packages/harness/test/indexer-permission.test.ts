import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiHarnessPermission } from '@smarteverything/domain';
import { desiredHarnessConfiguration, installedHarnessBuiltins } from '../src';
import { HARNESS_CODEGRAPH_PACKAGE } from '../src/composition/builtins';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const FULL: AiHarnessPermission = { sandbox: 'danger-full-access', approval: 'never' };
const READ_ONLY: AiHarnessPermission = { sandbox: 'read-only', approval: 'on-request' };

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function deviceWithIndexer(approval: 'allowed-once' | 'rejected'): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    approval,
    desiredConfiguration: {
      revision: 'indexer-only',
      entries: desiredHarnessConfiguration().entries.filter(
        (entry) => entry.package === HARNESS_CODEGRAPH_PACKAGE,
      ),
    },
    installedPlugins: (host) =>
      installedHarnessBuiltins(host).filter(
        (plugin) => plugin.package === HARNESS_CODEGRAPH_PACKAGE,
      ),
  });
  await mkdir(join(fixture.workspace, 'src'));
  await writeFile(
    join(fixture.workspace, 'src', 'main.ts'),
    'export function main(): number { return 1; }\n',
  );
  return fixture;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function index(host: RuntimeFixture, permission: AiHarnessPermission): Promise<string> {
  host.model.script(
    { kind: 'tool', id: 'index-1', name: 'codegraph_index', input: {} },
    { kind: 'text', text: 'finished' },
  );
  const session = await host.runtime.create({ ...host.sessionOptions(), permission });
  session.text('index this project');
  await turnsFinished(host, session, 1);
  const result = host.model.requests[1]?.messages.at(-1);
  return spoken(result === undefined ? [] : [result])[0]?.text ?? '';
}

describe('indexing the project in a read-only chat', () => {
  it('asks first and builds the index once the user agrees', async () => {
    const host = await deviceWithIndexer('allowed-once');

    await index(host, READ_ONLY);

    expect(host.approvals.map((request) => request.toolName)).toStrictEqual(['codegraph_index']);
    expect(await exists(join(host.workspace, '.codegraph'))).toBe(true);
  });

  it('builds nothing when the user says no', async () => {
    const host = await deviceWithIndexer('rejected');

    const result = await index(host, READ_ONLY);

    expect(host.approvals).toHaveLength(1);
    expect(await exists(join(host.workspace, '.codegraph'))).toBe(false);
    expect(result).toMatch(/rejected/u);
  });

  it('builds the index without asking when the chat has Full access', async () => {
    const host = await deviceWithIndexer('rejected');

    await index(host, FULL);

    expect(host.approvals).toHaveLength(0);
    expect(await exists(join(host.workspace, '.codegraph'))).toBe(true);
  });
});

async function chooseFolder(host: RuntimeFixture, folder: string): Promise<string> {
  host.model.script(
    { kind: 'tool', id: 'cd-1', name: 'set_working_directory', input: { path: folder } },
    { kind: 'text', text: 'finished' },
  );
  const session = await host.runtime.create({ ...host.sessionOptions(), permission: READ_ONLY });
  session.text('work in the other folder');
  await turnsFinished(host, session, 1);
  return spoken(host.model.requests[1]?.messages ?? [])
    .map((message) => message.text)
    .join('\n');
}

describe('choosing a primary folder in a read-only chat', () => {
  it('asks before indexing the new folder and indexes it once the user agrees', async () => {
    const host = await deviceWithIndexer('allowed-once');
    const folder = join(host.workspace, 'src');

    const result = await chooseFolder(host, folder);

    expect(host.approvals.map((request) => request.toolName)).toStrictEqual(['codegraph_index']);
    expect(await exists(join(folder, '.codegraph'))).toBe(true);
    expect(result).toContain('"files_indexed":1');
  });

  it('keeps the new folder when the user declines the indexing', async () => {
    const host = await deviceWithIndexer('rejected');
    const folder = join(host.workspace, 'src');

    const result = await chooseFolder(host, folder);

    expect(await exists(join(folder, '.codegraph'))).toBe(false);
    expect(result).toMatch(/rejected/u);
  });
});
