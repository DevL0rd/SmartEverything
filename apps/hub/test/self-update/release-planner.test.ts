import { describe, expect, it } from 'vitest';
import { planRelease } from '../../src/self-update/release-planner';

const plan = (...paths: string[]): readonly string[] => planRelease(paths).components;

describe('release planner', () => {
  it('releases only the Hub for Hub code, migrations and Hub-only packages', () => {
    expect(plan('apps/hub/src/store/migrations/201-x.ts')).toEqual(['hub']);
    expect(plan('packages/xiaomi/src/miot.ts', 'packages/models/src/a.ts')).toEqual(['hub']);
    expect(plan('tooling/self-update-hub.ts')).toEqual(['hub']);
  });

  it('releases the UI update for app code and assets that leave the native runtime alone', () => {
    expect(plan('apps/app/src/features/drive/a.tsx', 'apps/app/assets/x.png')).toEqual(['ui']);
    expect(plan('apps/app/app/(tabs)/index.tsx')).toEqual(['ui']);
  });

  it('releases the APK and the UI update for native modules and configuration', () => {
    for (const path of [
      'apps/app/modules/health-connect/android/A.kt',
      'apps/app/plugins/android-build/index.js',
      'apps/app/app.config.ts',
      'apps/app/app-identity.json',
      'apps/app/fingerprint.config.js',
      'apps/app/package.json',
      'apps/app/android/app/build.gradle',
    ])
      expect(plan(path)).toEqual(['app', 'ui']);
  });

  it('releases the Desktop for its own code and the Hub node and network code it embeds', () => {
    expect(plan('apps/desktop/src/main.ts')).toEqual(['desktop']);
    expect(plan('apps/hub/src/node/setup.ts')).toEqual(['hub', 'desktop']);
    expect(plan('apps/hub/src/client-network/lease.ts')).toEqual(['hub', 'desktop']);
  });

  it('follows the shared packages to everything that imports them', () => {
    expect(plan('packages/domain/src/devices.ts')).toEqual(['hub', 'desktop', 'ui']);
    expect(plan('packages/logging/src/logger.ts')).toEqual(['hub', 'desktop', 'ui']);
    expect(plan('packages/flow/src/a.ts')).toEqual(['hub', 'ui']);
    expect(plan('packages/harness/src/host/session.ts')).toEqual(['hub', 'desktop']);
  });

  it('releases everything for dependency and toolchain changes', () => {
    for (const path of ['pnpm-lock.yaml', 'package.json', 'patches/x.patch', 'tsconfig.base.json'])
      expect(plan(path)).toEqual(['hub', 'app', 'desktop', 'ui']);
  });

  it('releases everything for a path no rule knows rather than skipping it', () => {
    expect(plan('some-new-root/file.ts')).toEqual(['hub', 'app', 'desktop', 'ui']);
  });

  it('releases nothing for tests, docs and repository housekeeping', () => {
    expect(
      plan(
        'apps/hub/test/self-update/a.test.ts',
        'apps/app/src/a/b.test.tsx',
        'tooling/guards/x.test.ts',
        'docs/STANDARDS.md',
        'README.md',
        'release-notes/hub.json',
        '.github/workflows/ci.yml',
        'eslint.config.js',
      ),
    ).toEqual([]);
  });

  it('orders components Hub, app, Desktop, UI whatever order the paths arrive in', () => {
    expect(
      plan(
        'apps/app/src/a.tsx',
        'apps/desktop/src/a.ts',
        'apps/app/app.config.ts',
        'apps/hub/src/a.ts',
      ),
    ).toEqual(['hub', 'app', 'desktop', 'ui']);
  });

  it('plans a mixed push by the union of its paths', () => {
    expect(plan('apps/hub/test/a.test.ts', 'apps/app/src/a.tsx', 'docs/a.md')).toEqual(['ui']);
  });
});
