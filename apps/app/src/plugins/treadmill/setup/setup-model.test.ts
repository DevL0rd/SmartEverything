import type { TreadmillGattDump } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { TreadmillCandidate } from '../../../../modules/health-connect';
import {
  canContinue,
  initialSetup,
  pickedCandidate,
  setupReducer,
  sortedCandidates,
  stepAnnouncement,
  type SetupEvent,
  type SetupState,
} from './setup-model';

const BELT: TreadmillCandidate = {
  name: 'KS-K15',
  address: 'AA:BB:CC:DD:EE:FF',
  rssi: -58,
  services: ['fe00'],
};

const DUMP: TreadmillGattDump = {
  name: 'KS-K15',
  services: [{ uuid: 'fe00', characteristics: [{ uuid: 'fe01', properties: ['notify'] }] }],
};

function run(events: readonly SetupEvent[], from: SetupState = initialSetup(false)): SetupState {
  return events.reduce(setupReducer, from);
}

describe('the steps of adding a treadmill', () => {
  it('starts at the permission step unless the phone already allows it', () => {
    expect(initialSetup(false).step).toBe('permission');
    expect(initialSetup(true).step).toBe('scan');
  });

  it('moves on from the permission step when it is granted and stays on it when it is denied', () => {
    expect(run([{ type: 'permission', granted: true }]).step).toBe('scan');
    const denied = run([{ type: 'permission', granted: false }]);
    expect(denied.step).toBe('permission');
    expect(denied.permission).toBe('denied');
    expect(setupReducer(denied, { type: 'next' }).step).toBe('permission');
  });

  it('shows a belt once, with its newest signal, strongest first', () => {
    const state = run([
      { type: 'permission', granted: true },
      { type: 'candidate', candidate: { ...BELT, rssi: -80 } },
      {
        type: 'candidate',
        candidate: { ...BELT, address: '11:22:33:44:55:66', name: 'WalkingPad', rssi: -70 },
      },
      { type: 'candidate', candidate: BELT },
    ]);
    expect(sortedCandidates(state.candidates).map((entry) => [entry.name, entry.rssi])).toEqual([
      ['KS-K15', -58],
      ['WalkingPad', -70],
    ]);
  });

  it('needs a pick, the KS Fit check and the read before the name', () => {
    let state = run([{ type: 'permission', granted: true }]);
    expect(canContinue(state)).toBe(false);
    state = run(
      [
        { type: 'candidate', candidate: BELT },
        { type: 'pick', address: BELT.address },
      ],
      state,
    );
    expect(pickedCandidate(state)).toEqual(BELT);
    state = setupReducer(state, { type: 'next' });
    expect(state.step).toBe('check');
    expect(setupReducer(state, { type: 'next' }).step).toBe('check');
    state = run([{ type: 'closed', value: true }, { type: 'next' }], state);
    expect(state.step).toBe('read');
    expect(setupReducer(state, { type: 'next' }).step).toBe('read');
    state = run([{ type: 'dumped', dump: DUMP }, { type: 'next' }], state);
    expect(state.step).toBe('name');
    expect(canContinue(state)).toBe(false);
  });

  it('forgets the read table when another belt is picked, and goes back a step', () => {
    const state = run([
      { type: 'permission', granted: true },
      { type: 'candidate', candidate: BELT },
      { type: 'pick', address: BELT.address },
      { type: 'next' },
      { type: 'closed', value: true },
      { type: 'next' },
      { type: 'dumped', dump: DUMP },
    ]);
    expect(setupReducer(state, { type: 'pick', address: 'other' }).dump).toBeNull();
    expect(setupReducer(state, { type: 'back' }).step).toBe('check');
    expect(setupReducer(initialSetup(false), { type: 'back' }).step).toBe('permission');
  });

  it('announces where the person is', () => {
    expect(stepAnnouncement('permission')).toBe('Step 1 of 5: Permission');
    expect(stepAnnouncement('read')).toBe('Step 4 of 5: Read');
  });
});
