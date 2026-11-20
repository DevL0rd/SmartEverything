import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../src/data-layout';
import { runConfiguredUpdateCommand, UpdateCommandError } from '../../src/self-update/command';
import { testLayout } from '../support/test-layout';

const RUN = '00000000-0000-4000-8000-000000000001';
const CAUSE = "Cannot find package 'yauzl'";

let scratch: string;
let layout: HubLayout;

async function writeCheckout(root: string): Promise<void> {
  await mkdir(join(root, 'tooling'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'tsx'), { recursive: true });
  await writeFile(
    join(root, 'node_modules', 'tsx', 'package.json'),
    JSON.stringify({ name: 'tsx', type: 'module', exports: './index.mjs' }),
  );
  await writeFile(join(root, 'node_modules', 'tsx', 'index.mjs'), '');
  await writeFile(
    join(root, 'tooling', 'self-update-app-command.ts'),
    `process.stderr.write(${JSON.stringify(CAUSE)} + '\\n');\nprocess.exit(1);\n`,
  );
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'command-failure-'));
  layout = await testLayout(scratch);
  const checkout = join(scratch, 'checkout');
  await writeCheckout(checkout);
  await mkdir(dirname(layout.system.config.service), { recursive: true });
  await writeFile(
    layout.system.config.service,
    JSON.stringify({
      go2rtcBinary: join(scratch, 'go2rtc'),
      database: scratch,
      updateSource: {
        repository: 'owner/name',
        branch: 'main',
        checkout,
        remote: 'origin',
      },
    }),
  );
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('a failing update command', () => {
  it('reports the real cause of a failed status call', async () => {
    const failed = runConfiguredUpdateCommand('self-update-app-command.ts', layout, { runId: RUN });
    await expect(failed).rejects.toBeInstanceOf(UpdateCommandError);
    await expect(failed).rejects.toThrow(CAUSE);
  });
});
