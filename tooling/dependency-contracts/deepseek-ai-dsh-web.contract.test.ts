import { describe, expect, it } from 'vitest';
import { WebError } from '@deepseek-ai/dsh-web';
import { installedVersion } from './versions';
import { hubDeclaredVersion } from './hub-manifest';

describe('@deepseek-ai/dsh-web', () => {
  it('matches the hub pin and exposes the native blocked URL error contract', () => {
    expect(installedVersion('@deepseek-ai/dsh-web')).toBe(
      hubDeclaredVersion('@deepseek-ai/dsh-web'),
    );
    const failure = new WebError('Blocked destination', 'WEB_BLOCKED_URL');
    expect(failure).toBeInstanceOf(Error);
    expect(failure.code).toBe('WEB_BLOCKED_URL');
  });
});
