import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { env } from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout } from '../../apps/hub/src/data-layout/index.ts';
import {
  applyBuildHost,
  BuildHostError,
  nodeToolCommand,
  pnpmProgram,
  requireBuildHost,
} from '../build-host.ts';
import { androidHome, javaHome } from '../release-process.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const KEPT = [
  'PATH',
  'JAVA_HOME',
  'ANDROID_HOME',
  'GRADLE_USER_HOME',
  'electron_config_cache',
  'ANDROID_USER_HOME',
  'npm_config_cache',
  'npm_config_store_dir',
  'GOCACHE',
  'GOPATH',
  'XDG_CACHE_HOME',
  'TMPDIR',
] as const;
const PIN = { jdkMajor: 21, cmake: '3.22.1', go: '1.27.1' };

let scratch: string;
let saved: readonly (readonly [string, string | undefined])[];

function layout(): ReturnType<typeof hubLayout> {
  return hubLayout(scratch, {});
}

function pnpmVersion(): string {
  return '11.3.0';
}

function touchExecutable(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '#!/bin/sh\n');
  chmodSync(path, 0o755);
}

function provision(): void {
  const base = layout().cache.buildHost;
  touchExecutable(join(base, 'pnpm', pnpmVersion(), 'node_modules', '.bin', 'pnpm'));
  touchExecutable(join(base, `jdk-${String(PIN.jdkMajor)}`, 'bin', 'java'));
  touchExecutable(join(base, `go-${PIN.go}`, 'bin', 'go'));
  for (const part of ['build-tools', 'platforms', 'ndk', join('cmake', PIN.cmake)]) {
    mkdirSync(join(base, 'android-sdk', part), { recursive: true });
  }
}

function systemTools(...names: string[]): void {
  const bin = join(scratch, 'system-bin');
  for (const name of names) touchExecutable(join(bin, name));
  env['PATH'] = bin;
}

function googleServices(root: string): void {
  mkdirSync(join(root, 'apps', 'app'), { recursive: true });
  writeFileSync(join(root, 'apps', 'app', 'google-services.json'), '{}');
}

function checkout(): string {
  const root = join(scratch, 'checkout');
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ packageManager: `pnpm@${pnpmVersion()}` }),
  );
  return root;
}

function problemsOf(action: () => unknown): readonly string[] {
  try {
    action();
  } catch (error) {
    if (error instanceof BuildHostError) return error.problems;
    throw error;
  }
  return [];
}

beforeEach(() => {
  saved = KEPT.map((name) => [name, env[name]] as const);
  scratch = mkdtempSync(join(tmpdir(), 'build-host-'));
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) Reflect.deleteProperty(env, name);
    else env[name] = value;
  }
  rmSync(scratch, { recursive: true, force: true });
});

describe('applying the build host', () => {
  it('puts node, pnpm and the JDK first on PATH and points every tool at the toolchain folder', () => {
    env['PATH'] = '/usr/bin';
    const host = applyBuildHost(layout(), ROOT);
    const base = layout().cache.buildHost;
    expect(host.pnpm).toBe(join(base, 'pnpm', pnpmVersion(), 'node_modules', '.bin', 'pnpm'));
    expect((env['PATH'] ?? '').split(delimiter).slice(0, 6)).toEqual([
      dirname(process.execPath),
      dirname(host.pnpm),
      join(base, 'jdk-21', 'bin'),
      join(base, `go-${PIN.go}`, 'bin'),
      join(base, 'bin'),
      '/usr/bin',
    ]);
    expect(javaHome()).toBe(join(base, 'jdk-21'));
    expect(androidHome()).toBe(join(base, 'android-sdk'));
    expect(env['GRADLE_USER_HOME']).toBe(join(base, 'gradle'));
    expect(env['electron_config_cache']).toBe(join(base, 'electron'));
    expect(env['TMPDIR']).toBe(layout().tmp);
    expect(pnpmProgram()).toBe(host.pnpm);
  });

  it('keeps every cache and tool home on the data disk inside the toolchain folder', () => {
    applyBuildHost(layout(), ROOT);
    const base = layout().cache.buildHost;
    expect(env['ANDROID_USER_HOME']).toBe(join(base, 'android-user'));
    expect(env['npm_config_cache']).toBe(join(base, 'npm-cache'));
    expect(env['npm_config_store_dir']).toBe(join(base, 'pnpm-store'));
    expect(env['GOCACHE']).toBe(join(base, 'go-cache'));
    expect(env['GOPATH']).toBe(join(base, 'go-path'));
    expect(env['XDG_CACHE_HOME']).toBe(join(base, 'xdg-cache'));
    for (const name of [
      'GRADLE_USER_HOME',
      'electron_config_cache',
      'ANDROID_USER_HOME',
      'npm_config_cache',
      'npm_config_store_dir',
      'GOCACHE',
      'GOPATH',
      'XDG_CACHE_HOME',
      'TMPDIR',
    ] as const) {
      const folder = env[name] ?? '';
      expect(folder.startsWith(layout().root)).toBe(true);
      expect(existsSync(folder)).toBe(true);
    }
  });

  it('takes the pnpm version from the checkout packageManager', () => {
    const root = checkout();
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@12.0.1' }));
    expect(applyBuildHost(layout(), root).pnpm).toContain(join('pnpm', '12.0.1'));
  });

  it('refuses a checkout without a pinned pnpm version', () => {
    const root = checkout();
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'npm@10.0.0' }));
    expect(() => applyBuildHost(layout(), root)).toThrow();
  });

  it('runs repository tooling through the running node with tsx', () => {
    expect(nodeToolCommand('/x/tool.ts')).toEqual({
      program: process.execPath,
      args: ['--import', 'tsx', '/x/tool.ts'],
    });
  });
});

describe('requiring the build host', () => {
  it('names the missing pnpm and the provisioning command', () => {
    const root = checkout();
    expect(
      problemsOf(() => {
        requireBuildHost(layout(), root, 'hub');
      }),
    ).toEqual([expect.stringContaining('pnpm 11.3.0 is not provisioned')]);
  });

  it('accepts a provisioned hub host and a ui host with unzip', () => {
    const root = checkout();
    provision();
    systemTools('unzip');
    expect(
      problemsOf(() => {
        requireBuildHost(layout(), root, 'hub');
      }),
    ).toEqual([]);
    expect(
      problemsOf(() => {
        requireBuildHost(layout(), root, 'ui');
      }),
    ).toEqual([]);
  });

  it('names each missing system package for the desktop release', () => {
    const root = checkout();
    provision();
    systemTools();
    expect(
      problemsOf(() => {
        requireBuildHost(layout(), root, 'desktop');
      }),
    ).toEqual([
      expect.stringContaining('zip is not provisioned'),
      expect.stringContaining('unzip is not provisioned'),
    ]);
  });

  it('names the missing Go toolchain for the desktop release', () => {
    const root = checkout();
    touchExecutable(
      join(layout().cache.buildHost, 'pnpm', pnpmVersion(), 'node_modules', '.bin', 'pnpm'),
    );
    systemTools('zip', 'unzip');
    expect(
      problemsOf(() => {
        requireBuildHost(layout(), root, 'desktop');
      }),
    ).toEqual([expect.stringContaining('Go is not provisioned')]);
  });

  it('names the JDK, every SDK part and google-services.json for the Android build', () => {
    const root = checkout();
    touchExecutable(
      join(layout().cache.buildHost, 'pnpm', pnpmVersion(), 'node_modules', '.bin', 'pnpm'),
    );
    systemTools('unzip');
    const problems = problemsOf(() => {
      requireBuildHost(layout(), root, 'app');
    });
    expect(problems).toHaveLength(6);
    expect(problems[0]).toContain('the JDK is not provisioned');
    expect(problems.join('\n')).toContain('ndk');
    expect(problems.join('\n')).toContain('cmake');
    expect(problems.at(-1)).toContain('apps/app/google-services.json is missing');
  });

  it('accepts a fully provisioned Android build host', () => {
    const root = checkout();
    provision();
    googleServices(root);
    systemTools('unzip');
    expect(
      problemsOf(() => {
        requireBuildHost(layout(), root, 'app');
      }),
    ).toEqual([]);
  });
});

describe('release environment variables', () => {
  it('refuses to guess the JDK and the SDK on a machine that set neither', () => {
    Reflect.deleteProperty(env, 'JAVA_HOME');
    Reflect.deleteProperty(env, 'ANDROID_HOME');
    expect(() => javaHome()).toThrow(BuildHostError);
    expect(() => androidHome()).toThrow(BuildHostError);
  });
});
