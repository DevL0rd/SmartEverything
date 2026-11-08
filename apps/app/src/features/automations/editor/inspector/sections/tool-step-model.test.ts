import { describe, expect, it } from 'vitest';
import { toolSwapOf, toolTitle, toolValues } from './tool-step-model';

const SPEAK_ARGS = { target: { kind: 'device', deviceId: 'dev-4' }, text: 'The baby is crying.' };

describe('tool step', () => {
  it('offers Speak for voice_speak and carries the device and text over', () => {
    expect(toolSwapOf('voice_speak', SPEAK_ARGS)).toEqual({
      kind: 'notify.speak',
      name: 'Speak',
      ports: { target: { lit: { device: 'dev-4' } }, text: { lit: 'The baby is crying.' } },
    });
  });

  it('offers nothing for a tool without its own step', () => {
    expect(toolSwapOf('device_find', {})).toBeUndefined();
  });

  it('names the tool and lists its values in plain words', () => {
    expect(toolTitle('voice_speak')).toBe('Say something');
    const names = new Map([['dev-4', 'Nursery speaker']]);
    expect(toolValues(SPEAK_ARGS, (id) => names.get(id))).toEqual([
      { name: 'Target', text: 'Nursery speaker' },
      { name: 'Text', text: 'The baby is crying.' },
    ]);
  });
});
