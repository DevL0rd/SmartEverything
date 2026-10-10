import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { repositoryFile } from './versions';

function expandIn(pattern: string): string {
  return execFileSync(
    process.execPath,
    [
      '-e',
      `
        const braces = require('braces');
        try {
          const expanded = braces(process.argv[1], { expand: true });
          process.stdout.write('expanded ' + expanded.length);
        } catch (cause) {
          process.stdout.write(cause.constructor.name + ': ' + cause.message);
        }
      `,
      pattern,
    ],
    { cwd: repositoryFile('.'), encoding: 'utf8', timeout: 5000 },
  );
}

describe('braces security patch', () => {
  it('refuses a deeply nested pattern instead of exhausting the stack', () => {
    const nested = '{'.repeat(4000) + '}'.repeat(4000);

    expect(expandIn(nested)).toBe('SyntaxError: Input nesting exceeds max depth (256)');
  });

  it('still expands the patterns the build tooling writes', () => {
    expect(expandIn('a/{b,c}/{1..3}.{js,ts}')).toBe('expanded 12');
  });
});
