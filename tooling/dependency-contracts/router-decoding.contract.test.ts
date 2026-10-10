import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { repositoryFile } from './versions';

describe('the router query decoder', () => {
  it('preserves the CommonJS consumer API after the security upgrade', () => {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `
      const query = require('query-string');
      console.log(JSON.stringify(query.parse('title=Kitchen%20Light%203&name=%C3%A5')));
    `,
      ],
      { cwd: repositoryFile('.'), encoding: 'utf8', timeout: 5000 },
    );
    expect(JSON.parse(output)).toStrictEqual({ title: 'Kitchen Light 3', name: 'å' });
  });

  it('handles long malformed percent sequences without exponential decoding', () => {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `
      const decode = require('decode-uri-component');
      const value = '%C0'.repeat(10000);
      console.log(decode(value) === value);
    `,
      ],
      { cwd: repositoryFile('.'), encoding: 'utf8', timeout: 5000 },
    );
    expect(output.trim()).toBe('true');
  });
});
