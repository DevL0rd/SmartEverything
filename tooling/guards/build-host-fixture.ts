import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { afterAll, beforeAll } from 'vitest';
import { hubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { applyBuildHost } from '../build-host.ts';

const ROOT = join(import.meta.dirname, '..', '..');

const KEPT = [
  'PATH',
  'JAVA_HOME',
  'ANDROID_HOME',
  'GRADLE_USER_HOME',
  'electron_config_cache',
  'TMPDIR',
] as const;

export function useBuildHost(): void {
  const saved = KEPT.map((name) => [name, env[name]] as const);
  let data = '';
  beforeAll(() => {
    data = mkdtempSync(join(tmpdir(), 'build-host-fixture-'));
    applyBuildHost(hubLayout(data, {}), ROOT);
  });
  afterAll(() => {
    for (const [name, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(env, name);
      else env[name] = value;
    }
    rmSync(data, { recursive: true, force: true });
  });
}
