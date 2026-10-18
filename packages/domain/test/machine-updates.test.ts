import { describe, expect, it } from 'vitest';
import {
  MACHINE_UPDATE_MANIFEST,
  isNewerVersion,
  machineUpdateTarget,
  type MachineUpdateArtifact,
} from '../src/machine-updates';

const SHA = 'a'.repeat(64);

function artifact(overrides: Partial<MachineUpdateArtifact>): MachineUpdateArtifact {
  return {
    platform: 'linux',
    arch: 'x64',
    kind: 'zip',
    file: 'app-linux.zip',
    sha256: SHA,
    size: 10,
    ...overrides,
  };
}

describe('comparing release versions', () => {
  it.each([
    ['0.4.3', '0.4.2', true],
    ['0.5.0', '0.4.9', true],
    ['1.0.0', '0.99.99', true],
    ['0.4.2', '0.4.2', false],
    ['0.4.1', '0.4.2', false],
    ['0.10.0', '0.9.0', true],
  ])('treats %s against %s as newer: %s', (candidate, current, newer) => {
    expect(isNewerVersion(candidate, current)).toBe(newer);
  });
});

describe('the release manifest', () => {
  it('accepts one zip for linux and a nupkg with its RELEASES file for windows', () => {
    const manifest = MACHINE_UPDATE_MANIFEST.safeParse({
      version: '0.4.2',
      artifacts: [
        artifact({}),
        artifact({ platform: 'win32', kind: 'nupkg', file: 'full.nupkg' }),
        artifact({ platform: 'win32', kind: 'releases', file: 'RELEASES' }),
      ],
    });
    expect(manifest.success).toBe(true);
  });

  it('refuses a windows release without its RELEASES file', () => {
    const manifest = MACHINE_UPDATE_MANIFEST.safeParse({
      version: '0.4.2',
      artifacts: [artifact({ platform: 'win32', kind: 'nupkg', file: 'full.nupkg' })],
    });
    expect(manifest.success).toBe(false);
  });

  it('refuses a zip for windows', () => {
    const manifest = MACHINE_UPDATE_MANIFEST.safeParse({
      version: '0.4.2',
      artifacts: [artifact({ platform: 'win32' })],
    });
    expect(manifest.success).toBe(false);
  });

  it.each(['../up.zip', 'a/b.zip', '.hidden', ''])('refuses the file name %j', (file) => {
    expect(
      MACHINE_UPDATE_MANIFEST.safeParse({ version: '0.4.2', artifacts: [artifact({ file })] })
        .success,
    ).toBe(false);
  });

  it('refuses two artifacts that share a file name', () => {
    const manifest = MACHINE_UPDATE_MANIFEST.safeParse({
      version: '0.4.2',
      artifacts: [artifact({}), artifact({ platform: 'darwin' })],
    });
    expect(manifest.success).toBe(false);
  });

  it('refuses a version that is not major.minor.patch', () => {
    expect(
      MACHINE_UPDATE_MANIFEST.safeParse({ version: '0.4', artifacts: [artifact({})] }).success,
    ).toBe(false);
  });

  it('picks only the files of the asked platform and architecture', () => {
    const manifest = MACHINE_UPDATE_MANIFEST.parse({
      version: '0.4.2',
      artifacts: [artifact({}), artifact({ arch: 'arm64', file: 'arm.zip' })],
    });
    expect(
      machineUpdateTarget(manifest, { platform: 'linux', arch: 'arm64' }).map(
        (found) => found.file,
      ),
    ).toStrictEqual(['arm.zip']);
  });
});
