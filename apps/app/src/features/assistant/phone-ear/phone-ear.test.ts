import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type ListeningConfig } from '@smarteverything/domain';
import type { ListeningNativeState, ListeningNativeWake } from '../../../../modules/health-connect';
import { PhoneEar, type EarPorts } from './phone-ear';

const CONFIG: ListeningConfig = {
  wake: true,
  transcribe: false,
  sensitivity: 'standard',
  keywords: ['▁HE Y @hey', '▁JA R VI S @jarvis'],
  threshold: 0.15,
  nearMissThreshold: 0.1,
  pause_ms: 200,
};

const WAKE: ListeningNativeWake = {
  phrase: 'hey jarvis',
  snippetDbfs: -24,
  preroll: 'AAAA',
  atMs: 1,
};

const LISTENING: ListeningNativeState = { status: 'listening', detail: null, transcribe: false };

interface Harness {
  readonly ear: PhoneEar;
  readonly ports: EarPorts;
  readonly call: { phase: string };
  readonly env: { local: boolean; microphone: boolean };
}

function harness(): Harness {
  const call = { phase: 'idle' };
  const env = { local: true, microphone: true };
  const ports: EarPorts = {
    native: {
      configure: vi.fn(() => Promise.resolve()),
      rest: vi.fn(() => Promise.resolve()),
      resume: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
      releaseWake: vi.fn(() => Promise.resolve()),
      watchLevel: vi.fn(() => Promise.resolve()),
    },
    hub: {
      config: vi.fn(() => Promise.resolve(CONFIG)),
      claim: vi.fn(() => Promise.resolve({ granted: true })),
      reportState: vi.fn(() => Promise.resolve()),
    },
    calls: {
      phase: () => call.phase,
      active: () => call.phase !== 'idle' && call.phase !== 'ended',
      start: vi.fn(() => {
        call.phase = 'connecting';
      }),
      end: vi.fn(() => {
        call.phase = 'ended';
      }),
    },
    environment: {
      onLocalNetwork: () => env.local,
      microphoneGranted: () => Promise.resolve(env.microphone),
    },
  };
  return { ear: new PhoneEar(ports), ports, call, env };
}

let h: Harness;

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

beforeEach(() => {
  h = harness();
});

describe('starting the ear from the hub config', () => {
  it('hands the native ear the hub keyword lines byte for byte and the threshold', async () => {
    await h.ear.refresh();
    expect(h.ports.native.configure).toHaveBeenCalledWith({
      wake: true,
      transcribe: false,
      keywords: '▁HE Y @hey\n▁JA R VI S @jarvis',
      threshold: 0.15,
      pause_ms: 200,
      power_mode: 'always',
    });
    expect(h.ear.view.get().config).toEqual(CONFIG);
  });

  it('tells the hub its state again after every config fetch', async () => {
    await h.ear.refresh();
    await h.ear.refresh();
    expect(h.ports.hub.reportState).toHaveBeenCalledTimes(2);
    expect(h.ports.hub.reportState).toHaveBeenLastCalledWith(null);
  });

  it('stops the ear and reports the missing permission when the microphone is not allowed', async () => {
    h.env.microphone = false;
    await h.ear.refresh();
    expect(h.ports.native.configure).not.toHaveBeenCalled();
    expect(h.ports.native.stop).toHaveBeenCalled();
    expect(h.ports.hub.reportState).toHaveBeenCalledWith('needs_permission');
    expect(h.ear.view.get().microphone).toBe('denied');
  });

  it('hands the native ear the end-of-speech pause the hub chose', async () => {
    vi.mocked(h.ports.hub.config).mockResolvedValue({ ...CONFIG, pause_ms: 1000 });
    await h.ear.refresh();
    expect(h.ports.native.configure).toHaveBeenCalledWith(
      expect.objectContaining({ pause_ms: 1000 }),
    );
  });

  it('hands the power mode to the native ear', async () => {
    vi.mocked(h.ports.hub.config).mockResolvedValue({ ...CONFIG, power_mode: 'charging' });
    await h.ear.refresh();
    expect(h.ports.native.configure).toHaveBeenCalledWith(
      expect.objectContaining({ power_mode: 'charging' }),
    );
  });

  it('does not run the ear while away-from-home listening is on and the phone is at home', async () => {
    vi.mocked(h.ports.hub.config).mockResolvedValue({ ...CONFIG, power_mode: 'away_from_home' });
    await h.ear.refresh();
    expect(h.ports.native.configure).not.toHaveBeenCalled();
    expect(h.ports.native.stop).toHaveBeenCalled();
  });

  it('starts the away-only ear when the phone leaves the home network and stops it on return', async () => {
    vi.mocked(h.ports.hub.config).mockResolvedValue({ ...CONFIG, power_mode: 'away_from_home' });
    await h.ear.refresh();
    h.env.local = false;
    h.ear.networkChanged();
    await settle();
    expect(h.ports.native.configure).toHaveBeenCalledTimes(1);
    h.env.local = true;
    h.ear.networkChanged();
    await settle();
    expect(h.ports.native.stop).toHaveBeenCalledTimes(2);
  });

  it('ignores a network change for any other power mode', async () => {
    await h.ear.refresh();
    vi.mocked(h.ports.native.configure).mockClear();
    h.env.local = false;
    h.ear.networkChanged();
    await settle();
    expect(h.ports.native.configure).not.toHaveBeenCalled();
  });

  it('does not run the ear when both switches are off', async () => {
    vi.mocked(h.ports.hub.config).mockResolvedValue({ ...CONFIG, wake: false });
    await h.ear.refresh();
    expect(h.ports.native.configure).not.toHaveBeenCalled();
    expect(h.ports.native.stop).toHaveBeenCalled();
  });

  it('runs the ear for writing down alone', async () => {
    vi.mocked(h.ports.hub.config).mockResolvedValue({ ...CONFIG, wake: false, transcribe: true });
    await h.ear.refresh();
    expect(h.ports.native.configure).toHaveBeenCalledWith(
      expect.objectContaining({ wake: false, transcribe: true }),
    );
  });

  it('does not run the ear while the hub does not know the phone, and asks again when the app opens', async () => {
    vi.mocked(h.ports.hub.config).mockRejectedValueOnce(new ApiError('not_found', 'no ear'));
    await h.ear.refresh();
    expect(h.ports.native.configure).not.toHaveBeenCalled();
    expect(h.ports.native.stop).toHaveBeenCalled();
    await h.ear.ensure();
    expect(h.ports.native.configure).toHaveBeenCalledTimes(1);
  });

  it('does not report call changes to the hub while the hub does not know the phone', async () => {
    vi.mocked(h.ports.hub.config).mockRejectedValueOnce(new ApiError('not_found', 'no ear'));
    await h.ear.refresh();
    h.call.phase = 'connecting';
    h.ear.callChanged();
    h.call.phase = 'idle';
    h.ear.callChanged();
    await settle();
    expect(h.ports.hub.reportState).not.toHaveBeenCalled();
  });

  it('tries again when the app opens after Android refused to start the service', async () => {
    vi.mocked(h.ports.native.configure).mockRejectedValueOnce(new Error('refused'));
    await h.ear.refresh();
    await h.ear.ensure();
    expect(h.ports.native.configure).toHaveBeenCalledTimes(2);
  });

  it('applies a pushed config without telling the hub again', async () => {
    await h.ear.refresh();
    h.ear.receive({ kind: 'config', config: { ...CONFIG, transcribe: true } });
    await vi.waitFor(() => {
      expect(h.ports.native.configure).toHaveBeenLastCalledWith(
        expect.objectContaining({ transcribe: true }),
      );
    });
    expect(h.ports.hub.reportState).toHaveBeenCalledTimes(1);
  });

  it('starts again when the app opens and the service was stopped by Android', async () => {
    await h.ear.refresh();
    h.ear.nativeChanged(LISTENING);
    h.ear.nativeChanged({ status: 'off', detail: null, transcribe: false });
    await h.ear.ensure();
    expect(h.ports.native.configure).toHaveBeenCalledTimes(2);
  });

  it('leaves a running ear alone when the app opens', async () => {
    await h.ear.refresh();
    h.ear.nativeChanged(LISTENING);
    await h.ear.ensure();
    expect(h.ports.native.configure).toHaveBeenCalledTimes(1);
  });
});

describe('a wake word on the phone', () => {
  beforeEach(async () => {
    await h.ear.refresh();
  });

  it('on the home network asks the hub with the preroll and starts the call when granted', async () => {
    await h.ear.heard(WAKE);
    expect(h.ports.hub.claim).toHaveBeenCalledWith({
      phrase: 'hey jarvis',
      snippetDbfs: -24,
      preroll: 'AAAA',
    });
    expect(h.ports.calls.start).toHaveBeenCalledTimes(1);
    expect(h.ports.native.releaseWake).not.toHaveBeenCalled();
  });

  it('stays silent and drops the held audio when another source answers', async () => {
    vi.mocked(h.ports.hub.claim).mockResolvedValue({ granted: false });
    await h.ear.heard(WAKE);
    expect(h.ports.calls.start).not.toHaveBeenCalled();
    expect(h.ports.native.releaseWake).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the hub cannot be asked', async () => {
    vi.mocked(h.ports.hub.claim).mockRejectedValue(new Error('offline'));
    await h.ear.heard(WAKE);
    expect(h.ports.calls.start).not.toHaveBeenCalled();
    expect(h.ports.native.releaseWake).toHaveBeenCalledTimes(1);
  });

  it('off the home network answers by itself without asking the hub', async () => {
    h.env.local = false;
    await h.ear.heard(WAKE);
    expect(h.ports.hub.claim).not.toHaveBeenCalled();
    expect(h.ports.calls.start).toHaveBeenCalledTimes(1);
  });

  it('ignores a wake during a call', async () => {
    h.call.phase = 'listening';
    await h.ear.heard(WAKE);
    expect(h.ports.hub.claim).not.toHaveBeenCalled();
    expect(h.ports.calls.start).not.toHaveBeenCalled();
    expect(h.ports.native.releaseWake).toHaveBeenCalledTimes(1);
  });
});

describe('the ear during a call', () => {
  beforeEach(async () => {
    await h.ear.refresh();
  });

  it('keeps listening while the call connects so no word is lost, then rests once it hears', () => {
    h.call.phase = 'connecting';
    h.ear.callChanged();
    expect(h.ports.native.rest).not.toHaveBeenCalled();
    h.call.phase = 'listening';
    h.ear.callChanged();
    h.call.phase = 'speaking';
    h.ear.callChanged();
    expect(h.ports.native.rest).toHaveBeenCalledTimes(1);
    expect(h.ports.native.rest).toHaveBeenCalledWith('in a call');
  });

  it('resumes when the call ends, even one that never connected', () => {
    h.call.phase = 'connecting';
    h.ear.callChanged();
    h.call.phase = 'ended';
    h.ear.callChanged();
    expect(h.ports.native.resume).toHaveBeenCalledTimes(1);
  });

  it('tells the hub about the conversation and its end', async () => {
    h.call.phase = 'connecting';
    h.ear.callChanged();
    h.call.phase = 'idle';
    h.ear.callChanged();
    await vi.waitFor(() => {
      expect(h.ports.hub.reportState).toHaveBeenCalledWith('in_conversation');
      expect(h.ports.hub.reportState).toHaveBeenLastCalledWith(null);
    });
  });

  it('ignores call changes that keep the same phase', () => {
    h.call.phase = 'listening';
    h.ear.callChanged();
    h.ear.callChanged();
    expect(h.ports.native.rest).toHaveBeenCalledTimes(1);
  });
});

describe('notices from the hub', () => {
  beforeEach(async () => {
    await h.ear.refresh();
  });

  it('ends the call the phone answered when something else won the wake', async () => {
    await h.ear.heard(WAKE);
    h.ear.receive({ kind: 'superseded', superseded: { winner: { source: 'camera', key: 'c1' } } });
    expect(h.ports.calls.end).toHaveBeenCalledTimes(1);
  });

  it('keeps a call the person started themselves when a wake is superseded', () => {
    h.call.phase = 'listening';
    h.ear.receive({ kind: 'superseded', superseded: { winner: { source: 'camera', key: 'c1' } } });
    expect(h.ports.calls.end).not.toHaveBeenCalled();
  });

  it('starts and stops the level meter as the Listening page watches', () => {
    h.ear.receive({ kind: 'level', watched: true });
    h.ear.receive({ kind: 'level', watched: false });
    expect(h.ports.native.watchLevel).toHaveBeenNthCalledWith(1, true);
    expect(h.ports.native.watchLevel).toHaveBeenNthCalledWith(2, false);
  });

  it('ignores messages meant for computers', () => {
    h.ear.receive({ kind: 'rest', reason: 'discord_call' });
    h.ear.receive({ kind: 'call', active: true });
    expect(h.ports.native.rest).not.toHaveBeenCalled();
    expect(h.ports.native.stop).not.toHaveBeenCalled();
  });
});
