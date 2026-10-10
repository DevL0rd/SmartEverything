import { describe, expect, it } from 'vitest';
import {
  blasterOf,
  codesOf,
  irSearchRemotes,
  learnOutcome,
  libraryDeviceOf,
  remotePageOf,
  remotesShownOn,
} from './ir-links';
import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';

const blaster = {
  id: 'blaster',
  kind: 'ir_blaster' as const,
  name: 'IR hub',
  parent_id: null,
  hidden: false,
};
const library = {
  id: 'tv',
  kind: 'ir_remote' as const,
  name: 'TV',
  parent_id: 'blaster',
  hidden: false,
};
const hidden = {
  id: 'shy',
  kind: 'ir_blaster' as const,
  name: 'Shy',
  parent_id: null,
  hidden: true,
};
const devices = [blaster, library, hidden];

function remote(id: string, name: string, blasterId = 'blaster'): IrRemoteRow {
  return {
    id,
    blaster_id: blasterId,
    name,
    category: 'tv',
    brand: null,
    created_at: '2026-10-08T00:00:00Z',
  };
}

const code: IrCodeRow = {
  id: 'code',
  remote_id: 'r1',
  button: 'Power',
  format: 'pulses',
  code: 'AAE=',
  created_at: '2026-10-08T00:00:00Z',
};

describe('linking learned remotes to pages', () => {
  it('shows a remote on the library remote of the same name, or else on its blaster', () => {
    expect(libraryDeviceOf(remote('r1', 'TV'), devices)).toBe(library);
    expect(libraryDeviceOf(remote('r2', 'Fan'), devices)).toBeNull();
    expect(remotePageOf(remote('r1', 'TV'), devices)).toBe('tv');
    expect(remotePageOf(remote('r2', 'Fan'), devices)).toBe('blaster');
    expect(
      remotesShownOn(blaster, [remote('r1', 'TV'), remote('r2', 'Fan')], devices).map(
        (found) => found.id,
      ),
    ).toStrictEqual(['r2']);
  });

  it('finds the blaster of a remote', () => {
    expect(blasterOf(blaster, devices)).toBe(blaster);
    expect(blasterOf(library, devices)).toBe(blaster);
    expect(blasterOf({ ...library, parent_id: 'gone' }, devices)).toBeNull();
  });

  it('feeds search with the remotes of visible blasters and their buttons', () => {
    expect(codesOf('r1', [code, { ...code, id: 'x', remote_id: 'r9' }])).toStrictEqual([code]);
    expect(
      irSearchRemotes([remote('r1', 'TV'), remote('r3', 'Hidden', 'shy')], [code], devices),
    ).toStrictEqual([
      {
        id: 'r1',
        name: 'TV',
        category: 'tv',
        brand: null,
        blasterId: 'blaster',
        pageDeviceId: 'tv',
        buttons: [{ button: 'Power', format: 'pulses', code: 'AAE=' }],
      },
    ]);
  });
});

describe('the outcome of learning', () => {
  it('waits while the server has not answered', () => {
    expect(learnOutcome(undefined)).toStrictEqual({ kind: 'waiting' });
    expect(learnOutcome({ status: 'running', result: null, error: null })).toStrictEqual({
      kind: 'waiting',
    });
    expect(learnOutcome({ status: 'pending', result: null, error: null })).toStrictEqual({
      kind: 'waiting',
    });
  });

  it('takes the learned code from a finished command', () => {
    expect(
      learnOutcome({
        status: 'succeeded',
        result: { format: 'head_key', code: '1:2' },
        error: null,
      }),
    ).toStrictEqual({ kind: 'learned', code: { format: 'head_key', code: '1:2' } });
  });

  it('names every failure', () => {
    expect(learnOutcome({ status: 'expired', result: null, error: null })).toStrictEqual({
      kind: 'failed',
      message: 'The server did not answer in time. Is the blaster online?',
    });
    expect(learnOutcome({ status: 'failed', result: null, error: 'timed out' })).toStrictEqual({
      kind: 'failed',
      message: 'timed out',
    });
    expect(learnOutcome({ status: 'failed', result: null, error: null })).toStrictEqual({
      kind: 'failed',
      message: 'The blaster reported a failure without a reason.',
    });
    expect(learnOutcome({ status: 'succeeded', result: { code: '' }, error: null })).toStrictEqual({
      kind: 'failed',
      message:
        'The blaster answered without a code: expected a format and a code, received {"code":""}.',
    });
  });
});
