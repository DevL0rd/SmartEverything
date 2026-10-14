import { describe, expect, it } from 'vitest';
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http';
import { installedVersion } from './versions';
import { hubDeclaredVersion } from './hub-manifest';

describe('@deepseek-ai/dsh-web-fetch-http', () => {
  it('matches the hub pin and exposes an anonymous HTTP provider', () => {
    expect(installedVersion('@deepseek-ai/dsh-web-fetch-http')).toBe(
      hubDeclaredVersion('@deepseek-ai/dsh-web-fetch-http'),
    );
    const provider = new HttpFetchProvider({
      maxResponseBytes: 1000,
      maxBodyChars: 1000,
      timeoutMs: 1000,
      maxRedirects: 0,
      userAgent: 'SmartEverything-contract',
    });
    expect(provider.id).toBe('http');
    expect(provider.available()).toBe(true);
    expect(typeof provider.fetch).toBe('function');
  });
});
