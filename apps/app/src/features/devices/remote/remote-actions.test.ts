import { EMPTY_IR_REMOTE_STATE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { stepText } from './remote-actions';

const TEMP = { id: 'temp', label: 'Temperature', up: 'Temp up', down: 'Temp down' } as const;
const SPEED = { id: 'speed', label: 'Speed', up: 'Speed up', down: 'Speed down' } as const;
const VOLUME = { id: 'volume', label: 'Volume', up: 'Vol up', down: 'Vol down' } as const;

describe('stepText', () => {
  it('shows a dash until a key has been sent, never an invented value', () => {
    expect(stepText(TEMP, EMPTY_IR_REMOTE_STATE)).toBe('–');
    expect(stepText(SPEED, EMPTY_IR_REMOTE_STATE)).toBe('–');
  });

  it('shows the counted value once a key was sent', () => {
    expect(stepText(TEMP, { ...EMPTY_IR_REMOTE_STATE, temp: 23 })).toBe('23°');
    expect(stepText(SPEED, { ...EMPTY_IR_REMOTE_STATE, speed: 3 })).toBe('3');
  });

  it('shows no number for a volume the remote can never read back', () => {
    expect(stepText(VOLUME, EMPTY_IR_REMOTE_STATE)).toBeNull();
  });
});
