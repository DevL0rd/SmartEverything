import { describe, expect, it } from 'vitest';
import { assertIsolatedHome, isolatedHomeEnvironment } from './isolation.ts';

const SCRATCH = '/var/tmp/claude-agents/rig-x';
const REAL = '/home/someone';

describe('rig home isolation', () => {
  it('points the home, the XDG config home and the Claude config home into the scratch folder', () => {
    const environment = isolatedHomeEnvironment(SCRATCH);
    expect(() => { assertIsolatedHome(environment, SCRATCH, REAL); }).not.toThrow();
    for (const value of Object.values(environment))
      expect(value.startsWith(`${SCRATCH}/`)).toBe(true);
  });

  it('refuses the real home and a Claude config home outside the scratch folder', () => {
    const good = isolatedHomeEnvironment(SCRATCH);
    expect(() => { assertIsolatedHome({ ...good, HOME: REAL }, SCRATCH, REAL); }).toThrow(/real home/u);
    expect(() => { assertIsolatedHome({ ...good, CLAUDE_CONFIG_DIR: `${REAL}/.claude` }, SCRATCH, REAL); },
    ).toThrow(/CLAUDE_CONFIG_DIR/u);
    expect(() => { assertIsolatedHome({ ...good, XDG_CONFIG_HOME: `${SCRATCH}/../x` }, SCRATCH, REAL); },
    ).toThrow();
  });

  it('refuses a missing variable', () => {
    const { CLAUDE_CONFIG_DIR: _omitted, ...rest } = isolatedHomeEnvironment(SCRATCH);
    expect(() => { assertIsolatedHome(rest, SCRATCH, REAL); }).toThrow(/CLAUDE_CONFIG_DIR/u);
  });
});
