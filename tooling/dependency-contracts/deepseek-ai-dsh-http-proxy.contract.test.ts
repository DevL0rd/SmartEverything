import { describe, expect, it } from 'vitest';
import { proxyRouteFor } from '@deepseek-ai/dsh-http-proxy';
import { HARNESS_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('@deepseek-ai/dsh-http-proxy', () => {
  it('matches the harness pin and exposes the process routing decision', () => {
    expect(installedVersion('@deepseek-ai/dsh-http-proxy')).toBe(
      declaredVersion(HARNESS_MANIFEST, '@deepseek-ai/dsh-http-proxy'),
    );
    expect(proxyRouteFor(new URL('https://example.com/')).proxied).toBe(false);
  });
});
