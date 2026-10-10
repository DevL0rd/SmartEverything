import { createHash, createHmac } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  HTTP_METHODS,
  SIGN_METHOD,
  canonicalUrl,
  contentSha256,
  sign,
  signedHeaders,
  stringToSign,
  type CloudRequest,
} from '../src';

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const documented = {
  clientId: '1KAD46OrT9HafiKdsXeg',
  secret: '4OHBOnWOqaEC1mWXOpVL3yV50s0qGSRC',
  t: 1588925778000,
  nonce: '5138cc3a9033d69856923fd07b491173',
  signatureHeaders: { area_id: '29a33e8796834b1efa6', call_id: '8afdb70ab2ed11eb85290242ac130003' },
};

const tokenRequest: CloudRequest = {
  method: 'GET',
  path: '/v1.0/token',
  query: { grant_type: '1' },
  body: '',
  signatureHeaders: documented.signatureHeaders,
};

const businessRequest: CloudRequest = {
  method: 'GET',
  path: '/v2.0/apps/schema/users',
  query: { page_size: '50', page_no: '1' },
  body: '',
  signatureHeaders: documented.signatureHeaders,
};

describe('cloud request signing', () => {
  it('lists the HTTP methods Tuya accepts', () => {
    expect(HTTP_METHODS).toStrictEqual(['GET', 'POST', 'PUT', 'DELETE']);
    expect(SIGN_METHOD).toBe('HMAC-SHA256');
  });

  it('hashes the body as lower-case hex SHA-256', () => {
    expect(contentSha256('')).toBe(EMPTY_SHA256);
    expect(contentSha256('{"commands":[]}')).toBe(
      createHash('sha256').update('{"commands":[]}').digest('hex'),
    );
  });

  it('sorts query parameters by name and leaves a path without a query untouched', () => {
    expect(canonicalUrl('/v1.0/devices', {})).toBe('/v1.0/devices');
    expect(canonicalUrl('/p', { b: '2', a: '1', c: 'x y' })).toBe('/p?a=1&b=2&c=x y');
  });

  it('builds the documented token string to sign', () => {
    expect(stringToSign(tokenRequest)).toBe(
      `GET\n${EMPTY_SHA256}\narea_id:29a33e8796834b1efa6\ncall_id:8afdb70ab2ed11eb85290242ac130003\n\n/v1.0/token?grant_type=1`,
    );
  });

  it('builds a string to sign with no signature headers as an empty line', () => {
    expect(
      stringToSign({ method: 'POST', path: '/x', query: {}, body: 'a', signatureHeaders: {} }),
    ).toBe(`POST\n${contentSha256('a')}\n\n/x`);
  });

  it('reproduces the documented token signature', () => {
    expect(sign({ ...documented, accessToken: null, request: tokenRequest })).toBe(
      '9E48A3E93B302EEECC803C7241985D0A34EB944F40FB573C7B5C2A82158AF13E',
    );
  });

  it('reproduces the documented business signature', () => {
    expect(
      sign({
        ...documented,
        accessToken: '3f4eda2bdec17232f67c0b188af3eec1',
        request: businessRequest,
      }),
    ).toBe('AE4481C692AA80B25F3A7E12C3A5FD9BBF6251539DD78E565A1A72A508A88784');
  });

  it('agrees with an independent HMAC for any request', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.option(fc.string({ minLength: 1 }), { nil: null }),
        fc.string(),
        (secret, body, accessToken, nonce) => {
          const request: CloudRequest = {
            method: 'POST',
            path: '/v1.0/iot-03/devices/d/commands',
            query: {},
            body,
            signatureHeaders: {},
          };
          const expected = createHmac('sha256', secret)
            .update(`id${accessToken ?? ''}7${nonce}${stringToSign(request)}`)
            .digest('hex')
            .toUpperCase();
          expect(sign({ clientId: 'id', secret, accessToken, t: 7, nonce, request })).toBe(
            expected,
          );
        },
      ),
    );
  });

  it('sends the token request headers without an access token', () => {
    expect(
      signedHeaders({
        clientId: 'client',
        secret: 'secret',
        accessToken: null,
        t: 12,
        nonce: 'n',
        request: { ...tokenRequest, signatureHeaders: {} },
      }),
    ).toStrictEqual({
      client_id: 'client',
      sign: sign({
        clientId: 'client',
        secret: 'secret',
        accessToken: null,
        t: 12,
        nonce: 'n',
        request: { ...tokenRequest, signatureHeaders: {} },
      }),
      sign_method: 'HMAC-SHA256',
      t: '12',
      nonce: 'n',
    });
  });

  it('sends the access token and the signature headers on a business request', () => {
    const input = {
      ...documented,
      accessToken: '3f4eda2bdec17232f67c0b188af3eec1',
      request: businessRequest,
    };
    expect(signedHeaders(input)).toStrictEqual({
      area_id: '29a33e8796834b1efa6',
      call_id: '8afdb70ab2ed11eb85290242ac130003',
      'Signature-Headers': 'area_id:call_id',
      access_token: '3f4eda2bdec17232f67c0b188af3eec1',
      client_id: '1KAD46OrT9HafiKdsXeg',
      sign: 'AE4481C692AA80B25F3A7E12C3A5FD9BBF6251539DD78E565A1A72A508A88784',
      sign_method: 'HMAC-SHA256',
      t: '1588925778000',
      nonce: '5138cc3a9033d69856923fd07b491173',
    });
  });
});
