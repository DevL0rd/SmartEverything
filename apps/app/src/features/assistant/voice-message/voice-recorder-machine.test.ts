import { describe, expect, it } from 'vitest';
import {
  VOICE_MESSAGE_MIN_MS,
  VoiceRecorderMachine,
  type RecorderDevice,
} from './voice-recorder-machine';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface Rig {
  readonly machine: VoiceRecorderMachine;
  readonly calls: string[];
  readonly device: {
    granted: boolean;
    elapsed: number;
    uri: string | null;
    beginFails: boolean;
    readFails: boolean;
    permissionGate: Deferred<null> | null;
    beginGate: Deferred<null> | null;
  };
}

function rig(): Rig {
  const calls: string[] = [];
  const device: Rig['device'] = {
    granted: true,
    elapsed: 5000,
    uri: 'file:///voice.m4a',
    beginFails: false,
    readFails: false,
    permissionGate: null,
    beginGate: null,
  };
  const fake: RecorderDevice = {
    permission: async () => {
      calls.push('permission');
      await device.permissionGate?.promise;
      return device.granted;
    },
    begin: async () => {
      calls.push('begin');
      await device.beginGate?.promise;
      if (device.beginFails) {
        throw new Error('microphone busy');
      }
    },
    end: () => {
      calls.push('end');
      return Promise.resolve(device.uri);
    },
    abort: () => {
      calls.push('abort');
      return Promise.resolve();
    },
    elapsedMs: () => device.elapsed,
    read: (uri) => {
      calls.push(`read ${uri}`);
      return device.readFails
        ? Promise.reject(new Error('file gone'))
        : Promise.resolve(new Uint8Array([1, 2, 3]).buffer);
    },
  };
  return {
    machine: new VoiceRecorderMachine(fake, () => new Date('2026-10-18T10:20:30.000Z')),
    calls,
    device,
  };
}

const phase = (r: Rig): string => r.machine.read().phase;

describe('voice recorder: idle to recording to a file', () => {
  it('starts idle, records after permission, and returns the named file', async () => {
    const r = rig();
    expect(phase(r)).toBe('idle');
    await r.machine.start();
    expect(phase(r)).toBe('recording');
    const outcome = await r.machine.finish();
    expect(phase(r)).toBe('idle');
    expect(outcome).toMatchObject({
      kind: 'file',
      file: { name: 'voice-message-2026-10-18T10-20-30.m4a', bytes: 3 },
    });
    expect(r.calls).toStrictEqual(['permission', 'begin', 'end', 'read file:///voice.m4a']);
  });

  it('ignores a second start while a recording is already going', async () => {
    const r = rig();
    await r.machine.start();
    await r.machine.start();
    expect(r.calls.filter((call) => call === 'begin')).toHaveLength(1);
  });

  it('tells subscribers about every phase change', async () => {
    const r = rig();
    const seen: string[] = [];
    r.machine.subscribe(() => {
      seen.push(phase(r));
    });
    await r.machine.start();
    await r.machine.finish();
    expect(seen).toContain('requesting');
    expect(seen).toContain('recording');
    expect(seen).toContain('saving');
    expect(seen.at(-1)).toBe('idle');
  });
});

describe('voice recorder: permission denied', () => {
  it('stays idle, flags denied and never touches the microphone', async () => {
    const r = rig();
    r.device.granted = false;
    await r.machine.start();
    expect(r.machine.read()).toStrictEqual({ phase: 'idle', denied: true });
    expect(r.calls).toStrictEqual(['permission']);
  });

  it('clears the denial once the person allows it and tries again', async () => {
    const r = rig();
    r.device.granted = false;
    await r.machine.start();
    r.device.granted = true;
    await r.machine.start();
    expect(r.machine.read()).toStrictEqual({ phase: 'recording', denied: false });
  });
});

describe('voice recorder: cancelled', () => {
  it('stops and releases the microphone when cancelled while recording', async () => {
    const r = rig();
    await r.machine.start();
    await r.machine.cancel();
    expect(phase(r)).toBe('idle');
    expect(r.calls.at(-1)).toBe('abort');
    expect(await r.machine.finish()).toStrictEqual({ kind: 'empty' });
  });

  it('never starts recording when cancelled while the permission prompt is open', async () => {
    const r = rig();
    r.device.permissionGate = deferred<null>();
    const starting = r.machine.start();
    expect(phase(r)).toBe('requesting');
    await r.machine.cancel();
    r.device.permissionGate.resolve(null);
    await starting;
    expect(phase(r)).toBe('idle');
    expect(r.calls).toStrictEqual(['permission']);
  });

  it('releases the microphone when cancelled while it is still preparing', async () => {
    const r = rig();
    r.device.beginGate = deferred<null>();
    const starting = r.machine.start();
    await Promise.resolve();
    await Promise.resolve();
    await r.machine.cancel();
    r.device.beginGate.resolve(null);
    await starting;
    expect(phase(r)).toBe('idle');
    expect(r.calls.at(-1)).toBe('abort');
  });

  it('does nothing when there is nothing to cancel', async () => {
    const r = rig();
    await r.machine.cancel();
    expect(r.calls).toStrictEqual([]);
  });
});

describe('voice recorder: too short and empty', () => {
  it('rejects a recording shorter than the minimum and reads nothing', async () => {
    const r = rig();
    r.device.elapsed = VOICE_MESSAGE_MIN_MS - 1;
    await r.machine.start();
    expect(await r.machine.finish()).toStrictEqual({ kind: 'too_short' });
    expect(phase(r)).toBe('idle');
    expect(r.calls.some((call) => call.startsWith('read'))).toBe(false);
  });

  it('accepts a recording of exactly the minimum', async () => {
    const r = rig();
    r.device.elapsed = VOICE_MESSAGE_MIN_MS;
    await r.machine.start();
    expect((await r.machine.finish()).kind).toBe('file');
  });

  it('reports an empty recording when the device kept no file', async () => {
    const r = rig();
    r.device.uri = null;
    await r.machine.start();
    expect(await r.machine.finish()).toStrictEqual({ kind: 'empty' });
  });
});

describe('voice recorder: failures', () => {
  it('releases the microphone and returns to idle when it cannot start', async () => {
    const r = rig();
    r.device.beginFails = true;
    await expect(r.machine.start()).rejects.toThrow('microphone busy');
    expect(phase(r)).toBe('idle');
    expect(r.calls.at(-1)).toBe('abort');
    r.device.beginFails = false;
    await r.machine.start();
    expect(phase(r)).toBe('recording');
  });

  it('returns to idle and surfaces the error when the recorded file cannot be read', async () => {
    const r = rig();
    r.device.readFails = true;
    await r.machine.start();
    await expect(r.machine.finish()).rejects.toThrow('file gone');
    expect(phase(r)).toBe('idle');
  });

  it('finishing without a recording is an empty outcome and touches nothing', async () => {
    const r = rig();
    expect(await r.machine.finish()).toStrictEqual({ kind: 'empty' });
    expect(r.calls).toStrictEqual([]);
  });
});
