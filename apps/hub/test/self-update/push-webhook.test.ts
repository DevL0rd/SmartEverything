import { describe, expect, it } from 'vitest';
import {
  decidePush,
  pushSignature,
  repositoryOf,
  validPushSignature,
} from '../../src/self-update/push-webhook';

const SECRET = 'fixture-secret';
const TIP = 'a'.repeat(40);
const BEFORE = 'b'.repeat(40);
const TARGET = { repository: 'devl0rd/smarteverything', branch: 'main' };

function push(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ref: 'refs/heads/main',
    before: BEFORE,
    after: TIP,
    deleted: false,
    repository: { full_name: 'DevL0rd/SmartEverything' },
    ...overrides,
  };
}

describe('push signature', () => {
  const body = Buffer.from('{"after":"x"}');

  it('accepts the GitHub HMAC of the exact body', () => {
    expect(validPushSignature(SECRET, body, pushSignature(SECRET, body))).toBe(true);
  });

  it('matches a signature computed by GitHub for a known body', () => {
    expect(pushSignature("It's a Secret to Everybody", Buffer.from('Hello, World!'))).toBe(
      'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
    );
  });

  it('rejects a changed body, another secret, a missing header and a wrong length', () => {
    const signature = pushSignature(SECRET, body);
    expect(validPushSignature(SECRET, Buffer.from('{"after":"y"}'), signature)).toBe(false);
    expect(validPushSignature('other', body, signature)).toBe(false);
    expect(validPushSignature(SECRET, body, undefined)).toBe(false);
    expect(validPushSignature(SECRET, body, 'sha256=abcd')).toBe(false);
    expect(validPushSignature(SECRET, body, signature.replace('sha256=', 'sha1='))).toBe(false);
  });
});

describe('push decision', () => {
  it('accepts a push to the configured branch of the configured repository', () => {
    expect(decidePush('push', push(), TARGET)).toEqual({
      kind: 'accepted',
      tip: TIP,
      before: BEFORE,
    });
  });

  it('answers the GitHub ping without queueing anything', () => {
    expect(decidePush('ping', { zen: 'Keep it logically awesome.' }, TARGET)).toEqual({
      kind: 'pong',
    });
  });

  it('ignores other branches, deleted branches, other repositories and other events', () => {
    expect(decidePush('push', push({ ref: 'refs/heads/dev' }), TARGET)).toEqual({
      kind: 'ignored',
      reason: 'other_branch',
    });
    expect(decidePush('push', push({ deleted: true }), TARGET)).toEqual({
      kind: 'ignored',
      reason: 'branch_deleted',
    });
    expect(decidePush('push', push({ repository: { full_name: 'someone/else' } }), TARGET)).toEqual(
      { kind: 'ignored', reason: 'other_repository' },
    );
    expect(decidePush('issues', push(), TARGET)).toEqual({ kind: 'ignored', reason: 'event' });
    expect(decidePush(undefined, push(), TARGET)).toEqual({ kind: 'ignored', reason: 'event' });
  });

  it('flags a push body that is not a push', () => {
    expect(decidePush('push', { ref: 'refs/heads/main' }, TARGET)).toEqual({ kind: 'malformed' });
    expect(decidePush('push', push({ after: 'not-a-commit' }), TARGET)).toEqual({
      kind: 'malformed',
    });
  });
});

describe('repository of a remote address', () => {
  it('reads the owner and name from every GitHub address form', () => {
    for (const url of [
      'git@github.com:DevL0rd/SmartEverything.git',
      'https://github.com/DevL0rd/SmartEverything',
      'https://github.com/DevL0rd/SmartEverything.git',
      'https://user:token@github.com/DevL0rd/SmartEverything.git',
      'ssh://git@github.com/DevL0rd/SmartEverything.git\n',
    ])
      expect(repositoryOf(url)).toBe('devl0rd/smarteverything');
  });

  it('does not read other hosts or malformed paths', () => {
    expect(repositoryOf('git@gitlab.com:DevL0rd/SmartEverything.git')).toBeUndefined();
    expect(repositoryOf('https://github.com/DevL0rd')).toBeUndefined();
    expect(repositoryOf('/srv/git/smarteverything.git')).toBeUndefined();
  });
});
