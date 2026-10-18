import { describe, expect, it } from 'vitest';
import mime from 'mime-types';

describe('mime-types contract', () => {
  it('adds a charset to text types and knows the web asset types', () => {
    expect(mime.contentType('app.css')).toBe('text/css; charset=utf-8');
    expect(mime.contentType('app.js')).toBe('text/javascript; charset=utf-8');
    expect(mime.contentType('module.wasm')).toBe('application/wasm');
    expect(mime.contentType('font.woff2')).toBe('font/woff2');
  });

  it('reports an unknown extension as false', () => {
    expect(mime.contentType('data.zzz')).toBe(false);
  });

  it('treats a string with a slash as an already complete media type', () => {
    expect(mime.contentType('/app.css')).toBe('/app.css');
  });
});
