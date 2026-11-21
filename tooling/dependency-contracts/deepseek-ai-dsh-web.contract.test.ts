import { describe, expect, it } from 'vitest';
import { WebError } from '@deepseek-ai/dsh-web';
import { HARNESS_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('@deepseek-ai/dsh-web', () => {
  it('matches the harness pin and exposes the native blocked URL error contract', () => {
    expect(installedVersion('@deepseek-ai/dsh-web')).toBe(
      declaredVersion(HARNESS_MANIFEST, '@deepseek-ai/dsh-web'),
    );
    const failure = new WebError('Blocked destination', 'WEB_BLOCKED_URL');
    expect(failure).toBeInstanceOf(Error);
    expect(failure.code).toBe('WEB_BLOCKED_URL');
  });
});
