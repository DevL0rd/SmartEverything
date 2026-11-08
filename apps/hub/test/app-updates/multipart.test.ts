import { describe, expect, it } from 'vitest';
import { MultipartBoundaryError, multipartMixed } from '../../src/app-updates/multipart';

describe('writing a multipart/mixed body', () => {
  it('writes the parts byte for byte with CRLF line ends', () => {
    const body = multipartMixed('abc123', [
      {
        name: 'manifest',
        contentType: 'application/json',
        headers: { 'expo-signature': 'sig="x", keyid="main"' },
        body: '{"id":1}',
      },
      { name: 'directive', contentType: 'application/json', body: '{"type":"noUpdateAvailable"}' },
    ]);
    expect(body.contentType).toBe('multipart/mixed; boundary=abc123');
    expect(body.bytes.toString('utf8')).toBe(
      [
        '--abc123',
        'content-disposition: form-data; name="manifest"',
        'content-type: application/json',
        'expo-signature: sig="x", keyid="main"',
        '',
        '{"id":1}',
        '--abc123',
        'content-disposition: form-data; name="directive"',
        'content-type: application/json',
        '',
        '{"type":"noUpdateAvailable"}',
        '--abc123--',
        '',
      ].join('\r\n'),
    );
  });

  it('counts the bytes of multi-byte text, not its characters', () => {
    const body = multipartMixed('b', [{ name: 'manifest', contentType: 'text/plain', body: 'é' }]);
    expect(body.bytes.includes(Buffer.from([0xc3, 0xa9, 0x0d, 0x0a]))).toBe(true);
  });

  it('refuses a boundary that is not valid or occurs in a part', () => {
    expect(() => multipartMixed('bad boundary', [])).toThrow(MultipartBoundaryError);
    expect(() => multipartMixed('', [])).toThrow(/1 to 70 characters/u);
    expect(() =>
      multipartMixed('xx', [{ name: 'manifest', contentType: 'text/plain', body: 'a--xxb' }]),
    ).toThrow(/does not occur in any part body/u);
  });

  it('refuses a line break inside a header or a part name', () => {
    expect(() =>
      multipartMixed('xx', [{ name: 'a\r\nb', contentType: 'text/plain', body: '' }]),
    ).toThrow(MultipartBoundaryError);
    expect(() =>
      multipartMixed('xx', [
        { name: 'a', contentType: 'text/plain', headers: { h: 'v\nw' }, body: '' },
      ]),
    ).toThrow(/header value/u);
  });
});
