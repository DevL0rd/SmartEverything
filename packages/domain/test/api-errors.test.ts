import { describe, expect, it } from 'vitest';
import { API_ERROR, API_ERROR_CODES, API_ERROR_STATUS, ApiError, apiErrorOf } from '../src';

const STATUS_BY_CODE: readonly (readonly [string, number])[] = [
  ['invalid_request', 400],
  ['unauthorized', 401],
  ['forbidden', 403],
  ['not_found', 404],
  ['method_not_allowed', 405],
  ['conflict', 409],
  ['link_expired', 410],
  ['payload_too_large', 413],
  ['unsupported_media_type', 415],
  ['command_refused', 422],
  ['pairing_code_invalid', 422],
  ['public_url_not_verified', 422],
  ['rate_limited', 429],
  ['internal', 500],
  ['upstream_failed', 502],
  ['camera_unavailable', 503],
];

describe('api error codes', () => {
  it('API_ERROR_STATUS maps every code to its HTTP status', () => {
    expect(Object.entries(API_ERROR_STATUS)).toStrictEqual(STATUS_BY_CODE);
  });

  it('API_ERROR_CODES lists every code in order', () => {
    expect(API_ERROR_CODES).toStrictEqual(STATUS_BY_CODE.map(([code]) => code));
  });
});

describe('api error envelopes', () => {
  it('API_ERROR accepts every code with a message', () => {
    for (const code of API_ERROR_CODES) {
      const body = { error: { code, message: 'No.' } };
      expect(API_ERROR.parse(body)).toStrictEqual(body);
    }
  });

  it('API_ERROR refuses an unknown code, an empty message and extra keys', () => {
    expect(API_ERROR.safeParse({ error: { code: 'teapot', message: 'No.' } }).success).toBe(false);
    expect(API_ERROR.safeParse({ error: { code: 'internal', message: '' } }).success).toBe(false);
    expect(
      API_ERROR.safeParse({ error: { code: 'internal', message: 'No.', detail: 1 } }).success,
    ).toBe(false);
    expect(
      API_ERROR.safeParse({ error: { code: 'internal', message: 'No.' }, extra: 1 }).success,
    ).toBe(false);
  });
});

describe('ApiError', () => {
  it('carries its code, message and the status of the code', () => {
    const error = new ApiError('not_found', 'No such room.');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.code).toBe('not_found');
    expect(error.message).toBe('No such room.');
    expect(error.status).toBe(404);
  });

  it('writes the error envelope of its code and message', () => {
    expect(new ApiError('rate_limited', 'Slow down.').body()).toStrictEqual({
      error: { code: 'rate_limited', message: 'Slow down.' },
    });
  });

  it('takes the status of every code from the table', () => {
    for (const code of API_ERROR_CODES) {
      expect(new ApiError(code, 'x').status).toBe(new Map(STATUS_BY_CODE).get(code));
    }
  });
});

describe('apiErrorOf', () => {
  it('rebuilds the error an envelope describes', () => {
    const error = apiErrorOf(409, { error: { code: 'conflict', message: 'Taken.' } });
    expect(error.code).toBe('conflict');
    expect(error.message).toBe('Taken.');
    expect(error.status).toBe(409);
  });

  it('reports a body without an envelope as an upstream failure quoting the body', () => {
    const error = apiErrorOf(502, { a: 1 });
    expect(error.code).toBe('upstream_failed');
    expect(error.status).toBe(502);
    expect(error.message).toBe('The server answered HTTP 502 without an error envelope: {"a":1}.');
    expect(apiErrorOf(500, 'boom').message).toBe(
      'The server answered HTTP 500 without an error envelope: "boom".',
    );
  });
});
