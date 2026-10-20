import type { TelevisionSettingsRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { directAddressOf, foundScreens, linkProgressOf } from './direct-link';

const ROW: TelevisionSettingsRow = {
  device_id: 'tv-1',
  direct_host: '192.168.1.40',
  direct_mac: 'a1:b2:c3:d4:e5:f6',
  input_names: {},
  wake_macs: [],
  wake_worked_at: null,
};

const LINK_ROW = {
  provider: 'samsung_tv',
  account_label: 'Living room TV',
  status: 'linked',
  prompt: null,
  phase: null,
  problem: null,
  last_error: null,
  device_count: 0,
  updated_at: '2026-10-18T12:00:00.000Z',
} as const;

describe('the direct address of a screen', () => {
  it('shows the address and the wake address in capitals once linked', () => {
    expect(directAddressOf(ROW)).toStrictEqual({ host: '192.168.1.40', mac: 'A1:B2:C3:D4:E5:F6' });
  });

  it('is absent without settings or before linking', () => {
    expect(directAddressOf(null)).toBeNull();
    expect(directAddressOf({ ...ROW, direct_host: null, direct_mac: null })).toBeNull();
  });
});

describe('screens found on the network', () => {
  it('lists only screens that reported an address and says which are linked already', () => {
    const candidate = { model: 'QA65S95B', likely: true, linkedTo: null };
    expect(
      foundScreens(
        [
          { ...candidate, host: '10.0.0.5', name: 'Living room', macAddress: 'a1:b2:c3:d4:e5:f6' },
          { ...candidate, host: '10.0.0.6', name: 'Other', model: null, macAddress: null },
          {
            ...candidate,
            host: '10.0.0.7',
            name: 'Here',
            macAddress: 'aa:bb:cc:dd:ee:01',
            linkedTo: 'tv-1',
          },
          {
            ...candidate,
            host: '10.0.0.8',
            name: 'There',
            model: null,
            macAddress: 'aa:bb:cc:dd:ee:02',
            linkedTo: 'tv-2',
          },
        ],
        'tv-1',
      ),
    ).toStrictEqual([
      {
        host: '10.0.0.5',
        name: 'Living room',
        detail: 'QA65S95B · 10.0.0.5 · A1:B2:C3:D4:E5:F6',
        note: null,
      },
      {
        host: '10.0.0.7',
        name: 'Here',
        detail: 'QA65S95B · 10.0.0.7 · AA:BB:CC:DD:EE:01',
        note: 'Linked to this screen now',
      },
      {
        host: '10.0.0.8',
        name: 'There',
        detail: '10.0.0.8 · AA:BB:CC:DD:EE:02',
        note: 'Linked to another screen in the app, picking it moves the link here',
      },
    ]);
  });
});

describe('the progress of linking', () => {
  it('waits on the screen, then on the approval, then shows the link', () => {
    expect(linkProgressOf({ kind: 'form' })).toStrictEqual({ kind: 'pick' });
    const reaching = linkProgressOf({ kind: 'working', phase: 'signing_in' });
    expect(reaching.kind === 'working' && reaching.steps.map((step) => step.state)).toStrictEqual([
      'active',
      'waiting',
    ]);
    const asking = linkProgressOf({
      kind: 'prompt',
      prompt: { kind: 'accept_on_device', device: 'Living room TV' },
    });
    expect(asking.kind === 'working' && asking.steps.map((step) => step.state)).toStrictEqual([
      'done',
      'active',
    ]);
    expect(linkProgressOf({ kind: 'done', row: LINK_ROW }).kind).toBe('linked');
  });

  it('fails with a plain reason and the hub detail', () => {
    expect(
      linkProgressOf({ kind: 'failed', problem: 'bad_credentials', detail: 'declined on the TV' }),
    ).toStrictEqual({
      kind: 'failed',
      title: 'The screen said no, or nobody chose Allow in time',
      detail: 'declined on the TV',
    });
    expect(linkProgressOf({ kind: 'failed', problem: 'network', detail: null })).toMatchObject({
      title: 'The hub could not reach the screen. Keep it on and on the same network as the hub',
    });
  });
});
