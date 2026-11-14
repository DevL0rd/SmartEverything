import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../src/data-layout';
import {
  configuredUpdateEntry,
  requireUpdateSource,
  runConfiguredUpdateCommand,
  UpdateCommandError,
  UpdateUnavailableError,
} from '../../src/self-update/command';
import { findUpdateSource } from '../../src/self-update/update-source';
import { ServiceConfigError } from '../../src/service/configuration';
import { testLayout } from '../support/test-layout';

const TSX = fileURLToPath(new URL('../../../../node_modules/tsx', import.meta.url));
const SCRIPT = `
const input = JSON.parse(process.argv[3]);
process.stderr.write('build noise\\n');
if (input.fail) {
  process.stderr.write('boom line\\n');
  process.exit(3);
}
process.stdout.write(JSON.stringify({ status: 'done' }) + '\\n');
`;

let scratch: string;
let layout: HubLayout;
let checkout: string;

function writeConfig(extra: Readonly<Record<string, unknown>>): void {
  mkdirSync(dirname(layout.system.config.service), { recursive: true });
  writeFileSync(
    layout.system.config.service,
    JSON.stringify({ go2rtcBinary: '/opt/go2rtc', ...extra }),
  );
}

function configure(): void {
  writeConfig({ updateSource: { checkout, remote: 'origin', branch: 'main' } });
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'update-source-'));
  layout = await testLayout(join(scratch, 'data'));
  checkout = join(scratch, 'checkout');
  mkdirSync(join(checkout, 'tooling'), { recursive: true });
  mkdirSync(join(checkout, 'node_modules'));
  symlinkSync(TSX, join(checkout, 'node_modules', 'tsx'));
  writeFileSync(join(checkout, 'tooling', 'self-update-app-command.ts'), SCRIPT);
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('the configured update source', () => {
  it('reads the source from the service configuration', () => {
    configure();
    expect(findUpdateSource(layout)).toStrictEqual({
      checkout,
      remote: 'origin',
      branch: 'main',
    });
    expect(requireUpdateSource(layout)).toStrictEqual({
      root: checkout,
      remote: 'origin',
      branch: 'main',
    });
  });

  it('names the configure tool when no source is configured', () => {
    writeConfig({});
    expect(findUpdateSource(layout)).toBeUndefined();
    expect(() => requireUpdateSource(layout)).toThrow(UpdateUnavailableError);
    expect(() => requireUpdateSource(layout)).toThrow(/configure-update-source\.ts/u);
  });

  it('refuses a relative checkout, a bad remote and unknown keys', () => {
    for (const source of [
      { checkout: 'relative', remote: 'origin', branch: 'main' },
      { checkout, remote: 'not a remote', branch: 'main' },
      { checkout, remote: 'origin', branch: 'main', allowRemote: true },
    ]) {
      writeConfig({ updateSource: source });
      expect(() => findUpdateSource(layout)).toThrow(ServiceConfigError);
    }
  });

  it('refuses a checkout whose dependencies are not installed', async () => {
    configure();
    rmSync(join(checkout, 'node_modules'), { recursive: true });
    await expect(configuredUpdateEntry(layout, 'self-update-app-command.ts')).rejects.toThrow(
      UpdateUnavailableError,
    );
  });
});

describe.skipIf(process.platform !== 'linux')('running a build command', () => {
  it('sends the child output to the run log and returns its result line', async () => {
    configure();
    const runId = randomUUID();
    const result = await runConfiguredUpdateCommand('self-update-app-command.ts', layout, {
      input: { runId },
    });
    expect(result).toStrictEqual({ status: 'done' });
    const log = join(layout.system.updates.selfUpdate, 'jobs', `${runId}.log`);
    expect(readFileSync(log, 'utf8')).toBe('build noise\n');
  });

  it('quotes the end of the run log when the child fails', async () => {
    configure();
    const runId = randomUUID();
    const failure: unknown = await runConfiguredUpdateCommand(
      'self-update-app-command.ts',
      layout,
      { input: { runId }, fail: true },
    ).catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(UpdateCommandError);
    expect(failure instanceof Error ? failure.message : '').toMatch(/exit code 3[\s\S]*boom line/u);
  });
});
