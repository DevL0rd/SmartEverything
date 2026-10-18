import type { RunProgram } from '../../run-program';
import type { RingSound, RingVolume } from '../machine-ring';

const RING_LEVEL = 100;

function osascript(program: RunProgram, script: string): Promise<string> {
  return program('osascript', ['-e', script]);
}

export function darwinVolume(program: RunProgram): RingVolume {
  return {
    current: async (): Promise<RingSound> => {
      const [volume, muted] = await Promise.all([
        osascript(program, 'output volume of (get volume settings)'),
        osascript(program, 'output muted of (get volume settings)'),
      ]);
      return { volume: Number(volume.trim()), muted: muted.trim() === 'true' };
    },
    raise: async (): Promise<void> => {
      await osascript(program, 'set volume without output muted');
      await osascript(program, `set volume output volume ${String(RING_LEVEL)}`);
    },
    restore: async (sound): Promise<void> => {
      await osascript(program, `set volume output volume ${String(sound.volume)}`);
      await osascript(
        program,
        sound.muted ? 'set volume with output muted' : 'set volume without output muted',
      );
    },
  };
}
