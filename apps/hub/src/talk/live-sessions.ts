import { audioFrameOf, type TalkMemberKind } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { systemClock } from '../clock';
import { OPUS_SILENCE, SpeakerPacer } from '../reach/voice-pacing';
import type { CameraMicrophones } from './camera-microphone';
import type { CameraSpeakers } from './camera-speaker';
import type { TalkMembership } from './membership';
import type { PacketSink, TalkEndpoint } from './transmission';

export function continuousSpeaker(sink: PacketSink): PacketSink {
  const pacer = new SpeakerPacer(systemClock, sink.packet, {
    idle: OPUS_SILENCE,
    spoke: (): void => undefined,
  });
  return {
    packet: (packet): void => {
      pacer.push(packet);
    },
    end: (): void => {
      pacer.stop();
      sink.end();
    },
  };
}

export interface LiveMember {
  readonly kind: TalkMemberKind;
  readonly id: string;
}

export type LiveEnding = 'ended' | 'channel_removed';

export interface LiveChannel {
  readonly channelId: string;
  readonly conversationId: string;
  readonly speak: (packet: Uint8Array) => void;
  readonly onMemberAudio: (
    listener: (member: LiveMember, packet: Uint8Array) => void,
  ) => () => void;
  readonly onEnd: (listener: (ending: LiveEnding) => void) => () => void;
  readonly end: () => void;
}

export interface LiveConversation {
  readonly conversationId: string;
  readonly label: string;
}

type AudioListener = (member: LiveMember, packet: Uint8Array) => void;

interface Session extends LiveConversation {
  readonly channelId: string;
  readonly left: Set<string>;
  readonly greeted: Map<string, TalkEndpoint>;
  readonly audio: Set<AudioListener>;
  readonly ends: Set<(ending: LiveEnding) => void>;
  readonly speakers: PacketSink[];
  readonly microphones: (() => void)[];
}

export interface LiveSessionsOptions {
  readonly membership: TalkMembership;
  readonly speakers: CameraSpeakers;
  readonly microphones: CameraMicrophones;
  readonly endpoints: () => Iterable<TalkEndpoint>;
  readonly changed: () => void;
  readonly log: Logger;
}

export class LiveSessions {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly options: LiveSessionsOptions) {}

  has(channelId: string): boolean {
    return this.sessions.has(channelId);
  }

  open(channelId: string, conversation: LiveConversation): LiveChannel {
    const session: Session = {
      ...conversation,
      channelId,
      left: new Set(),
      greeted: new Map(),
      audio: new Set(),
      ends: new Set(),
      speakers: this.speakersFor(channelId, conversation.conversationId),
      microphones: [],
    };
    this.sessions.set(channelId, session);
    this.openMicrophones(session);
    for (const endpoint of this.options.endpoints()) {
      this.greet(endpoint);
    }
    this.options.log.info('talk.live_started', {
      channelId,
      conversationId: conversation.conversationId,
    });
    this.options.changed();
    return this.handleOf(session);
  }

  engaged(endpoint: TalkEndpoint): boolean {
    return [...this.sessions.values()].some((session) => session.greeted.has(endpoint.id));
  }

  greet(endpoint: TalkEndpoint): void {
    for (const session of this.sessions.values()) {
      this.sync(session, endpoint);
    }
  }

  uplink(endpoint: TalkEndpoint, packet: Uint8Array): boolean {
    const session = [...this.sessions.values()].find((each) => each.greeted.has(endpoint.id));
    if (session === undefined) {
      return false;
    }
    session.audio.forEach((listener) => {
      listener({ kind: 'client', id: endpoint.clientId }, packet);
    });
    return true;
  }

  leave(endpoint: TalkEndpoint): void {
    for (const session of this.sessions.values()) {
      if (session.greeted.has(endpoint.id)) {
        session.left.add(endpoint.id);
        this.sync(session, endpoint);
      }
    }
  }

  forget(endpointId: string): void {
    this.sessions.forEach((session) => {
      session.left.delete(endpointId);
      session.greeted.delete(endpointId);
    });
  }

  membershipChanged(): void {
    for (const session of [...this.sessions.values()]) {
      if (this.options.membership.channel(session.channelId) === undefined) {
        this.finish(session, 'channel_removed');
        continue;
      }
      for (const endpoint of this.options.endpoints()) {
        this.sync(session, endpoint);
      }
    }
  }

  stop(): void {
    [...this.sessions.values()].forEach((session) => {
      this.finish(session, 'ended');
    });
  }

  private inSession(session: Session, endpoint: TalkEndpoint): boolean {
    return (
      !session.left.has(endpoint.id) &&
      this.options.membership.hears(endpoint.clientId, session.channelId)
    );
  }

  private handleOf(session: Session): LiveChannel {
    return {
      channelId: session.channelId,
      conversationId: session.conversationId,
      speak: (packet): void => {
        this.speak(session, packet);
      },
      onMemberAudio: (listener) => {
        session.audio.add(listener);
        return (): void => {
          session.audio.delete(listener);
        };
      },
      onEnd: (listener) => {
        session.ends.add(listener);
        return (): void => {
          session.ends.delete(listener);
        };
      },
      end: (): void => {
        this.finish(session, 'ended');
      },
    };
  }

  private speak(session: Session, packet: Uint8Array): void {
    if (this.sessions.get(session.channelId) !== session) {
      return;
    }
    const frame = audioFrameOf(packet);
    session.greeted.forEach((endpoint) => {
      endpoint.audio(frame);
    });
    session.speakers.forEach((speaker) => {
      speaker.packet(packet);
    });
  }

  private speakersFor(channelId: string, conversationId: string): PacketSink[] {
    return this.options.membership.speakerCameras(channelId).flatMap((cameraId) => {
      const sink = this.options.speakers.open(cameraId, conversationId, 'assistant');
      return sink === null ? [] : [continuousSpeaker(sink)];
    });
  }

  private openMicrophones(session: Session): void {
    for (const cameraId of this.options.membership.memberCameras(session.channelId)) {
      this.options.microphones
        .open(cameraId, {
          packet: (packet) => {
            session.audio.forEach((listener) => {
              listener({ kind: 'camera', id: cameraId }, packet);
            });
          },
          ended: (failure) => {
            if (failure !== null) {
              this.options.log.warn('talk.live_microphone_lost', { cameraId, reason: failure });
            }
          },
        })
        .then(
          (microphone) => {
            if (this.sessions.get(session.channelId) === session) {
              session.microphones.push(microphone.stop);
            } else {
              microphone.stop();
            }
          },
          (cause: unknown) => {
            this.options.log.warn('talk.live_microphone_failed', {
              cameraId,
              reason: cause instanceof Error ? cause.message : String(cause),
            });
          },
        );
    }
  }

  private sync(session: Session, endpoint: TalkEndpoint): void {
    const inside = this.inSession(session, endpoint);
    const greeted = session.greeted.has(endpoint.id);
    if (inside && !greeted) {
      session.greeted.set(endpoint.id, endpoint);
      endpoint.send({
        type: 'live_start',
        channelId: session.channelId,
        conversationId: session.conversationId,
        label: session.label,
      });
    } else if (!inside && greeted) {
      session.greeted.delete(endpoint.id);
      this.closeFor(endpoint, session);
    }
  }

  private closeFor(endpoint: TalkEndpoint, session: Session): void {
    endpoint.send({
      type: 'live_end',
      channelId: session.channelId,
      conversationId: session.conversationId,
    });
  }

  private finish(session: Session, ending: LiveEnding): void {
    if (this.sessions.get(session.channelId) !== session) {
      return;
    }
    this.sessions.delete(session.channelId);
    session.greeted.forEach((endpoint) => {
      this.closeFor(endpoint, session);
    });
    session.speakers.forEach((speaker) => {
      speaker.end();
    });
    session.microphones.forEach((stop) => {
      stop();
    });
    session.ends.forEach((listener) => {
      listener(ending);
    });
    this.options.log.info('talk.live_ended', { channelId: session.channelId, ending });
    this.options.changed();
  }
}
