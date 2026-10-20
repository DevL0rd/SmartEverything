import { describe, expect, it } from 'vitest';
import type { BottleCandidate } from '../../../../modules/health-connect';
import {
  canContinue,
  informationOf,
  initialSetup,
  pickedCandidate,
  setupReducer,
  signalWord,
  sortedCandidates,
  stepAnnouncement,
  type SetupState,
} from './setup-model';

const candidate = (address: string, rssi: number): BottleCandidate => ({
  name: 'LARQ_063UfDVRKBz',
  serial: '0123456789ABCDEF',
  address,
  rssi,
});

const readout = {
  dis: {
    manufacturer: 'LARQ',
    model: 'PureVis 2',
    serial: '0123456789ABCDEF',
    firmware: '1.13',
    hardware: null,
    software: null,
  },
  battery: 80,
};

function run(state: SetupState, ...events: Parameters<typeof setupReducer>[1][]): SetupState {
  return events.reduce(setupReducer, state);
}

describe('bottle setup', () => {
  it('starts at the permission or, when allowed, at the search', () => {
    expect(initialSetup(false, null).step).toBe('permission');
    expect(initialSetup(true, 'p1')).toMatchObject({ step: 'find', personId: 'p1', body: 680 });
  });

  it('moves on from the permission when it is granted and stays when denied', () => {
    const start = initialSetup(false, null);
    expect(setupReducer(start, { type: 'permission', granted: true }).step).toBe('find');
    const denied = setupReducer(start, { type: 'permission', granted: false });
    expect(denied.step).toBe('permission');
    expect(canContinue(denied)).toBe(false);
  });

  it('keeps one entry per address and sorts the strongest first', () => {
    const state = run(
      initialSetup(true, null),
      { type: 'candidate', candidate: candidate('AA', -80) },
      { type: 'candidate', candidate: candidate('BB', -50) },
      { type: 'candidate', candidate: candidate('AA', -70) },
    );
    expect(state.candidates).toHaveLength(2);
    expect(sortedCandidates(state.candidates).map((entry) => entry.address)).toEqual(['BB', 'AA']);
  });

  it('needs a pick before the read and a read before the choice', () => {
    let state = run(initialSetup(true, null), {
      type: 'candidate',
      candidate: candidate('AA', -60),
    });
    expect(setupReducer(state, { type: 'next' }).step).toBe('find');
    state = run(state, { type: 'pick', address: 'AA' }, { type: 'next' });
    expect(state.step).toBe('read');
    expect(pickedCandidate(state)?.address).toBe('AA');
    expect(setupReducer(state, { type: 'next' }).step).toBe('read');
    state = run(state, { type: 'read', readout }, { type: 'next' });
    expect(state.step).toBe('choose');
    expect(informationOf(state)?.model).toBe('PureVis 2');
    expect(canContinue(state)).toBe(false);
    expect(setupReducer(state, { type: 'next' })).toBe(state);
  });

  it('forgets a read when another bottle is picked and can go back', () => {
    const state = run(
      initialSetup(true, null),
      { type: 'pick', address: 'AA' },
      { type: 'read', readout },
      { type: 'pick', address: 'BB' },
    );
    expect(state.readout).toBeNull();
    expect(setupReducer({ ...state, step: 'read' }, { type: 'back' }).step).toBe('find');
  });

  it('keeps the choices', () => {
    const state = run(
      initialSetup(true, null),
      { type: 'body', body: 1000 },
      { type: 'filter', filter: true },
      { type: 'person', personId: 'p2' },
    );
    expect(state).toMatchObject({ body: 1000, filter: true, personId: 'p2' });
  });

  it('words the step and the signal', () => {
    expect(stepAnnouncement('read')).toBe('Step 3 of 4: Read');
    expect([-50, -70, -90].map(signalWord)).toEqual(['strong', 'good', 'weak']);
  });
});
