import { randomUUID } from 'node:crypto';
import type { ComputerRuntimeExecute } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { NativeReceipts, type NativeReceiptRequest } from '../../src/computers/native-receipts';
import { RuntimeReceipts } from '../../src/computers/runtime-receipts';

const OWNER = { profileId: 'profile', clientId: 'client' };
const DEVICE = randomUUID();
const KEPT = 10_000;

function runtimeRequest(id: string): ComputerRuntimeExecute {
  return {
    runtime: 'claude',
    request: {
      operation: 'native_tools_call',
      operation_id: id,
      session_id: 'session',
      name: 'tool',
      arguments: {},
    },
  };
}

function nativeRequest(
  id: string,
): Exclude<NativeReceiptRequest, { operation: 'native_operation' }> {
  return {
    operation: 'native_tools_call',
    operation_id: id,
    session_id: 'session',
    name: 'tool',
    arguments: {},
  };
}

describe('runtime receipts', () => {
  it('keep accepting new operations past the window and forget the oldest first', () => {
    const receipts = new RuntimeReceipts<string>();
    const target = { device_id: DEVICE, runtime: 'claude' } as const;
    const ids = Array.from({ length: KEPT + 25 }, () => randomUUID());
    for (const id of ids) receipts.accept(target, OWNER, runtimeRequest(id), 'link');

    expect(receipts.profile(ids[0] ?? '', target, 'link')).toBeNull();
    expect(receipts.profile(ids[24] ?? '', target, 'link')).toBeNull();
    expect(receipts.profile(ids[25] ?? '', target, 'link')).toBe('profile');
    expect(receipts.profile(ids.at(-1) ?? '', target, 'link')).toBe('profile');
    expect(() => {
      receipts.accept(target, OWNER, runtimeRequest(ids.at(-1) ?? ''), 'link');
    }).not.toThrow();
  });
});

describe('native receipts', () => {
  it('keep accepting new operations past the window and forget the oldest first', () => {
    const receipts = new NativeReceipts<string>();
    const ids = Array.from({ length: KEPT + 25 }, () => randomUUID());
    for (const id of ids) receipts.accept(DEVICE, OWNER, nativeRequest(id), 'link');

    expect(receipts.profile(ids[0] ?? '', DEVICE, 'link')).toBeNull();
    expect(receipts.profile(ids[25] ?? '', DEVICE, 'link')).toBe('profile');
    expect(receipts.profile(ids.at(-1) ?? '', DEVICE, 'link')).toBe('profile');
  });
});
