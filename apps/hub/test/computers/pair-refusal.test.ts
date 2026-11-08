import { ApiError } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let access: ComputerNodeAccess;

beforeEach(async () => {
  opened = await testStore();
  access = new ComputerNodeAccess(opened.store, () => new Date('2026-11-07T10:00:00.000Z'));
});

afterEach(async () => {
  await opened.close();
});

function refusal(url: string): ApiError {
  try {
    access.pair(url, 'owner-client');
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('the pairing was issued');
}

describe('issuing a computer pairing code', () => {
  it.each(['http://127.0.0.1:7880', 'https://localhost:7880', 'http://[::1]:7880'])(
    'refuses the loopback address %s',
    (url) => {
      const error = refusal(url);
      expect(error.code).toBe('invalid_request');
      expect(error.message).toContain('over loopback');
    },
  );

  it('refuses plain http to another machine', () => {
    const error = refusal('http://192.168.1.4:7880');
    expect(error.code).toBe('invalid_request');
    expect(error.message).toContain('requires HTTPS');
  });
});
