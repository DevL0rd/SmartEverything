import { describe, expect, it } from 'vitest';
import BashSandbox from '@deepseek-ai/dsh-bash-sandbox';
import PwshSandbox from '@deepseek-ai/dsh-pwsh-sandbox';
import * as BashTools from '@deepseek-ai/dsh-tool-bash';
import * as PwshTools from '@deepseek-ai/dsh-tool-pwsh';
import { declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

const HARNESS_MANIFEST = 'packages/harness/package.json';
const PINNED = [
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-pwsh-sandbox',
  '@deepseek-ai/dsh-pwsh-local',
] as const;

describe('@deepseek-ai/dsh-tool-pwsh and its executor', () => {
  it.each(PINNED)('installs %s at the version the harness pins, on the dsh line', (name) => {
    expect(installedVersion(name)).toBe(declaredVersion(HARNESS_MANIFEST, name));
    expect(installedVersion(name)).toBe(installedVersion('@deepseek-ai/dsh-tool-bash'));
  });

  it('asks for the same services as the bash tool it twins, so one composition serves both', () => {
    expect(PwshTools.inject).toStrictEqual(BashTools.inject);
    expect(PwshSandbox.inject).toStrictEqual(BashSandbox.inject);
  });

  it('names its executor and tool so the harness can mount them', () => {
    expect(PwshTools.name).toBe('tool-pwsh');
    expect(PwshSandbox.name).toBe('SandboxPwshExecutor');
    expect(PwshTools.apply).toBeTypeOf('function');
  });
});
