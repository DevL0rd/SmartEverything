import { NodeFailureError } from '../../node-failure';
import type { SessionAgent } from '../../session-agent/session-agent';
import { MachineRing, type RingSound, type RingVolume } from '../machine-ring';
import type { AudioControl, SessionControl } from '../session-controls';

const RING_VOLUME = 100;

function linuxVolume(
  audio: Pick<AudioControl, 'read'>,
  session: Pick<SessionControl, 'setVolume' | 'setMuted'>,
): RingVolume {
  return {
    current: async (): Promise<RingSound> => {
      const output = (await audio.read()).outputs.find((device) => device.isDefault);
      if (output === undefined) {
        throw new NodeFailureError('failed', 'This computer has no sound output to ring on.');
      }
      return { volume: output.volume, muted: output.muted };
    },
    raise: async (): Promise<void> => {
      await session.setMuted(false);
      await session.setVolume(RING_VOLUME);
    },
    restore: async (sound): Promise<void> => {
      await session.setVolume(sound.volume);
      await session.setMuted(sound.muted);
    },
  };
}

export class LinuxRing extends MachineRing {
  constructor(
    agent: Pick<SessionAgent, 'ring'>,
    audio: Pick<AudioControl, 'read'>,
    session: Pick<SessionControl, 'setVolume' | 'setMuted'>,
  ) {
    super(agent, linuxVolume(audio, session));
  }
}
