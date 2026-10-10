import { TALK_FRAME_MS, packetOfFrame } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type {
  HostedCall,
  HostedCallRequest,
  HostedSpeaking,
  Opening,
} from '../assistant-voice/outreach';
import type { HostedCaller } from '../assistant-voice/persona';
import type { Clock } from '../clock';
import { FEED_TAIL_MS } from './announcing';
import { endTonePackets, startTonePackets } from './end-tone';
import { OPUS_SILENCE, SpeakerPacer } from './voice-pacing';

export type HostVoice = (request: HostedCallRequest) => Promise<HostedCall>;

export const REACH_TOOL_NAMES: ReadonlySet<string> = new Set([
  'speak',
  'start_conversation',
  'call',
  'hang_up',
  'notify_person',
]);

export const CONVERSATION: HostedSpeaking = { hiddenTools: REACH_TOOL_NAMES };

export interface HostedVoiceDeps {
  readonly host: HostVoice;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

export interface HostedSpec {
  readonly key: string;
  readonly caller: HostedCaller;
  readonly opening: Opening;
  readonly play: (packet: Uint8Array) => void;
  readonly closed: () => void;
  readonly continuous?: boolean;
  readonly heard?: () => Int16Array;
}

export interface HostedLine {
  readonly call: HostedCall;
  readonly pacer: SpeakerPacer;
}

export async function hostLine(deps: HostedVoiceDeps, spec: HostedSpec): Promise<HostedLine> {
  const pacer = new SpeakerPacer(deps.clock, spec.play, {
    idle: spec.continuous === true ? OPUS_SILENCE : null,
    spoke: (frames): void => {
      deps.log.info('reach.spoke', { key: spec.key, ms: frames * TALK_FRAME_MS });
    },
  });
  if (spec.heard !== undefined) {
    startTonePackets().forEach((packet) => {
      pacer.push(packet);
    });
  }
  const call = await deps
    .host({
      callId: spec.opening.outreachId,
      caller: spec.caller,
      opening: spec.opening,
      speaking: CONVERSATION,
      ...(spec.heard === undefined ? {} : { heard: spec.heard }),
      endpoint: {
        id: spec.key,
        audio: (frame): void => {
          pacer.push(packetOfFrame(frame));
        },
        send: (message): void => {
          if (message.type === 'interrupted') {
            pacer.cut();
          } else if (message.type === 'ended') {
            sayGoodbye(deps, pacer, spec.closed);
          }
        },
      },
    })
    .catch((cause: unknown) => {
      pacer.stop();
      throw cause;
    });
  deps.log.info('reach.hosted', { key: spec.key, outreachId: spec.opening.outreachId });
  return { call, pacer };
}

function sayGoodbye(deps: HostedVoiceDeps, pacer: SpeakerPacer, closed: () => void): void {
  pacer.cut();
  endTonePackets().forEach((packet) => {
    pacer.push(packet);
  });
  pacer.whenDrained(() => {
    deps.clock.at(new Date(deps.clock.now().getTime() + FEED_TAIL_MS), () => {
      pacer.stop();
      closed();
    });
  });
}

export function once(work: () => void): () => void {
  let done = false;
  return (): void => {
    if (!done) {
      done = true;
      work();
    }
  };
}
