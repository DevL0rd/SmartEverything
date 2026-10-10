import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '../src/csp.js';

function directives(policy: string): Map<string, readonly string[]> {
  return new Map(
    policy.split('; ').map((directive) => {
      const [name = '', ...sources] = directive.split(' ');
      return [name, sources];
    }),
  );
}

describe('buildContentSecurityPolicy', () => {
  const policy = directives(buildContentSecurityPolicy('http://127.0.0.1:7880'));

  it('allows scripts from the app origin only, plus WebAssembly for speech detection', () => {
    expect(policy.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(policy.get('default-src')).toEqual(["'self'"]);
  });

  it('connects to the local server over http and its live socket over ws', () => {
    expect(policy.get('connect-src')).toEqual([
      "'self'",
      'http://127.0.0.1:7880',
      'ws://127.0.0.1:7880',
    ]);
  });

  it('shows images and media from blobs and the local server only', () => {
    expect(policy.get('img-src')).toEqual(["'self'", 'data:', 'blob:', 'http://127.0.0.1:7880']);
    expect(policy.get('media-src')).toEqual(["'self'", 'blob:', 'http://127.0.0.1:7880']);
  });

  it('forbids plugins, frames, base rewriting and form posts', () => {
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('frame-src')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'none'"]);
    expect(policy.get('form-action')).toEqual(["'none'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('uses wss for a server reached over https', () => {
    expect(
      directives(buildContentSecurityPolicy('https://home.example.com/')).get('connect-src'),
    ).toEqual(["'self'", 'https://home.example.com', 'wss://home.example.com']);
  });
});
