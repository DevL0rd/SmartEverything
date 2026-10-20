import { LISTENING_VIEW, type ListeningView } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_EAR_HOST,
  earHostHint,
  earHostOfValue,
  earHostOptions,
  earHostValue,
} from './ear-host-model';

const LAPTOP = '11111111-1111-4111-8111-111111111111';
const GONE = '22222222-2222-4222-8222-222222222222';

function sourceOf(
  key: string,
  kind: 'computer' | 'camera' | 'phone',
  name: string,
  state: 'listening' | 'offline',
): ListeningView['sources'][number] {
  return {
    key,
    kind,
    name,
    profileId: null,
    wake: true,
    transcribe: false,
    state,
    writing: { state: 'on' },
    sensitivity: null,
    changeable: true,
    claims: [],
  };
}

const VIEW: ListeningView = LISTENING_VIEW.parse({
  sources: [
    sourceOf(LAPTOP, 'computer', 'Laptop', 'listening'),
    sourceOf(GONE, 'computer', 'Desk', 'offline'),
    sourceOf('camera-1', 'camera', 'Porch', 'listening'),
    sourceOf('phone-1', 'phone', 'Pixel', 'listening'),
  ],
  last: null,
});

describe('the computer that listens for cameras, walkie channels and Discord', () => {
  it('offers Automatic first, then only computers, marking the offline ones', () => {
    expect(earHostOptions(VIEW)).toEqual([
      { value: AUTOMATIC_EAR_HOST, label: 'Automatic' },
      { value: LAPTOP, label: 'Laptop' },
      { value: GONE, label: 'Desk (offline)' },
    ]);
  });

  it('turns the stored host into a choice and a choice back into the stored host', () => {
    expect(earHostValue(null)).toBe(AUTOMATIC_EAR_HOST);
    expect(earHostValue(LAPTOP)).toBe(LAPTOP);
    expect(earHostOfValue(AUTOMATIC_EAR_HOST)).toBeNull();
    expect(earHostOfValue(LAPTOP)).toBe(LAPTOP);
  });

  it('explains what each state of the choice means', () => {
    expect(earHostHint(null, VIEW)).toContain('first online computer');
    expect(earHostHint(LAPTOP, VIEW)).toContain('Laptop listens for cameras');
    expect(earHostHint(GONE, VIEW)).toContain('Desk is offline');
    expect(earHostHint('33333333-3333-4333-8333-333333333333', VIEW)).toContain('not in your home');
  });
});
