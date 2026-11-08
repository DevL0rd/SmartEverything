import { VACUUM_FAULT_KEY, type VacuumVideoOpening } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { clock } from '../../../../format/time';
import { videoCard } from '../model/video-copy';
import { faultOfValues } from './use-vacuum-fault';
import {
  forgetPassword,
  isVideoPassword,
  keepsPassword,
  phaseOfLink,
  rememberPassword,
  rememberedPassword,
  runOpening,
  type OpeningPorts,
} from './vacuum-video';

function ports(opening: VacuumVideoOpening | Error): OpeningPorts & {
  readonly answer: ReturnType<typeof vi.fn<(sdp: string) => Promise<void>>>;
  readonly post: ReturnType<typeof vi.fn<OpeningPorts['post']>>;
} {
  return {
    offer: vi.fn(() => Promise.resolve('offer-sdp')),
    post: vi.fn<OpeningPorts['post']>(() =>
      opening instanceof Error ? Promise.reject(opening) : Promise.resolve(opening),
    ),
    answer: vi.fn<(sdp: string) => Promise<void>>(() => Promise.resolve()),
  };
}

describe('opening the robot camera', () => {
  it('posts the typed password with the offer and applies the live answer', async () => {
    const wired = ports({ status: 'live', sdp: 'answer-sdp' });
    await expect(runOpening(wired, '1234')).resolves.toEqual({ kind: 'connecting' });
    expect(wired.post).toHaveBeenCalledExactlyOnceWith('1234', 'offer-sdp');
    expect(wired.answer).toHaveBeenCalledExactlyOnceWith('answer-sdp');
  });

  it('opens with no password and goes straight to live', async () => {
    const wired = ports({ status: 'live', sdp: 'answer-sdp' });
    await expect(runOpening(wired, null)).resolves.toEqual({ kind: 'connecting' });
    expect(wired.post).toHaveBeenCalledExactlyOnceWith(null, 'offer-sdp');
  });

  it.each([
    [{ status: 'press_button', until: '2026-10-24T20:05:00.000Z' }, 'press_button'],
    [{ status: 'password_required' }, 'asking'],
    [{ status: 'wrong_password' }, 'asking'],
    [{ status: 'firewall_blocked', address: '192.168.1.20' }, 'firewall_blocked'],
    [{ status: 'no_reply' }, 'no_reply'],
  ] as const)(
    'turns the hub answer %o into the %s state without an answer',
    async (opening, kind) => {
      const wired = ports(opening);
      const phase = await runOpening(wired, '1234');
      expect(phase.kind).toBe(kind);
      expect(wired.answer).not.toHaveBeenCalled();
    },
  );

  it('shows a failed call as the unavailable state with its reason', async () => {
    const phase = await runOpening(ports(new Error('hub refused')), '1234');
    expect(phase).toEqual({ kind: 'unavailable', reason: 'hub refused' });
  });

  it('asks again after a wrong password and forgets it', async () => {
    const phase = await runOpening(ports({ status: 'wrong_password' }), '0000');
    expect(phase).toEqual({ kind: 'asking', wrong: true });
    expect(keepsPassword(phase)).toBe(false);
    expect(keepsPassword({ kind: 'connecting' })).toBe(true);
  });
});

describe('the video password', () => {
  it('takes exactly four digits', () => {
    expect(isVideoPassword('1234')).toBe(true);
    expect(isVideoPassword('123')).toBe(false);
    expect(isVideoPassword('12a4')).toBe(false);
    expect(isVideoPassword('12345')).toBe(false);
  });

  it('is kept in memory per robot until it is forgotten', () => {
    rememberPassword('robot-a', '1234');
    expect(rememberedPassword('robot-a')).toBe('1234');
    expect(rememberedPassword('robot-b')).toBeNull();
    forgetPassword('robot-a');
    expect(rememberedPassword('robot-a')).toBeNull();
  });
});

describe('the connection state', () => {
  it('goes live on connect and becomes unavailable when the path fails', () => {
    expect(phaseOfLink('connected', { kind: 'connecting' })).toEqual({ kind: 'live' });
    expect(phaseOfLink('disconnected', { kind: 'live' })).toEqual({ kind: 'connecting' });
    expect(phaseOfLink('failed', { kind: 'live' }).kind).toBe('unavailable');
    expect(phaseOfLink('closed', { kind: 'connecting' }).kind).toBe('unavailable');
  });

  it('never overrides a gate answer with a late peer state', () => {
    expect(phaseOfLink('connected', { kind: 'no_reply' })).toEqual({ kind: 'no_reply' });
  });
});

describe('the camera cards', () => {
  it('tells the user to press the button with the deadline', () => {
    const card = videoCard({ kind: 'press_button', until: '2026-10-24T20:05:00.000Z' }, 'UTC');
    expect(card.title).toBe('Press the button on the robot, then open the camera again');
    expect(card.body).toContain(`5 minutes, until ${clock('2026-10-24T20:05:00.000Z', 'UTC')}`);
  });

  it('names the address the firewall blocks and links the firewall screen', () => {
    const card = videoCard({ kind: 'firewall_blocked', address: '192.168.1.20' }, 'UTC');
    expect(card.body).toContain('192.168.1.20');
    expect(card.actions).toEqual(['firewall', 'retry']);
  });

  it('says the camera is off on demand with the privacy note and no dock claim', () => {
    const card = videoCard({ kind: 'idle' }, 'UTC');
    expect(card.body).toContain('private rooms');
    expect(card.body).not.toContain('dock');
    expect(card.actions).toEqual(['open']);
    expect(videoCard({ kind: 'no_reply' }, 'UTC').body).not.toContain('dock');
  });

  it('shows the button press glyph, not an open padlock, when the robot asks for a press', () => {
    const card = videoCard({ kind: 'press_button', until: '2026-10-24T20:05:00.000Z' }, 'UTC');
    expect(card.icon).toBe('pressButton');
  });
});

describe('the active fault', () => {
  it('reads the title and hint the hub exposes', () => {
    const value = JSON.stringify({
      code: 210002,
      title: "The robot vacuum's wheels are suspended",
      hint: 'Please place the robot vacuum on a horizontally flat surface',
      canHelp: true,
    });
    expect(
      faultOfValues({ [VACUUM_FAULT_KEY]: { value, observedAt: '2026-10-24T20:00:00.000Z' } }),
    ).toEqual({
      title: "The robot vacuum's wheels are suspended",
      hint: 'Please place the robot vacuum on a horizontally flat surface',
      canHelp: true,
    });
  });

  it('names a code without text and treats a missing value as no fault', () => {
    const value = JSON.stringify({ code: 100053, title: '', hint: '' });
    expect(
      faultOfValues({ [VACUUM_FAULT_KEY]: { value, observedAt: '2026-10-24T20:00:00.000Z' } }),
    ).toEqual({
      title: 'Fault 100053. Xiaomi gives no description for this code.',
      hint: null,
      canHelp: false,
    });
    expect(faultOfValues({})).toBeNull();
  });
});
