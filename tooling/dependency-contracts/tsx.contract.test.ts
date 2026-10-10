import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { itIsPinnedToItsDeclaredVersion } from './contract-helpers';
import { repositoryFile } from './versions';

function runScript(source: string): string {
  return execFileSync('pnpm', ['exec', 'tsx', '--eval', source], {
    cwd: repositoryFile('.'),
    encoding: 'utf8',
  });
}

describe('tsx contract', () => {
  itIsPinnedToItsDeclaredVersion('tsx');

  it('runs TypeScript without a build step, which is how the dev scripts run', () => {
    expect(runScript('const answer: number = 42; console.log(answer);').trim()).toBe('42');
  });

  it('resolves an extensionless relative import, which node alone cannot', () => {
    const source =
      "import { isScope } from './packages/logging/src/index';\n" +
      'console.log(isScope("tool.migrate"));';
    expect(runScript(source).trim()).toBe('true');
  });

  it('resolves a workspace package by name', () => {
    const source =
      "import { LOG_LEVELS } from '@smarteverything/logging';\nconsole.log(LOG_LEVELS.length);";
    expect(runScript(source).trim()).toBe('7');
  });
});
