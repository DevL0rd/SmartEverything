import { describe, expect, it } from 'vitest';
import { proxyRouteFor } from '@deepseek-ai/dsh-http-proxy';
import { installedVersion } from './versions';
import { hubDeclaredVersion } from './hub-manifest';

describe('@deepseek-ai/dsh-http-proxy', () => {
  it('matches the hub pin and exposes the process routing decision', () => {
    expect(installedVersion('@deepseek-ai/dsh-http-proxy')).toBe(
      hubDeclaredVersion('@deepseek-ai/dsh-http-proxy'),
    );
    expect(proxyRouteFor(new URL('https://example.com/')).proxied).toBe(false);
  });
});
