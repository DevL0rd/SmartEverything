import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computerNodeExecutable,
  desktopPackageResources,
} from '../../apps/desktop/src/package-layout.ts';
import {
  COMPUTER_NODE_VERSION,
  computerNodeTarget,
  verifyComputerNodeArchive,
} from '../computer-node-runtime.ts';

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('standalone Computer Node runtime', () => {
  it.each(['linux', 'darwin', 'win32'])('packages both supported %s architectures', (platform) => {
    for (const arch of ['x64', 'arm64']) {
      const target = computerNodeTarget(platform, arch);
      expect(target.archive).toContain(`node-v${COMPUTER_NODE_VERSION}-`);
      expect(target.checksum).toMatch(/^[a-f0-9]{64}$/u);
      expect(target.executable).toBe(computerNodeExecutable(platform));
      expect(desktopPackageResources(platform)).toContain(`computer/${target.executable}`);
      expect(desktopPackageResources(platform)).toContain('computer/node/LICENSE');
    }
  });

  it('rejects unsupported targets instead of using the build host runtime', () => {
    expect(() => computerNodeTarget('linux', 'ia32')).toThrow('linux-ia32');
  });

  it('accepts exact archive bytes and rejects corrupted bytes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'computer-node-'));
    scratch.push(directory);
    const file = join(directory, 'archive');
    writeFileSync(file, 'official archive fixture');
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    expect(() => {
      verifyComputerNodeArchive(file, hash);
    }).not.toThrow();
    writeFileSync(file, 'corrupt archive fixture');
    expect(() => {
      verifyComputerNodeArchive(file, hash);
    }).toThrow('checksum mismatch');
  });
});
