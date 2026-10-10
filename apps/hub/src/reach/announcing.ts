import { AI_SPEECH_AUDIO_MAX, type AiSpeechNotice, type CallEnding } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { AnnounceRequest, AnnounceSink, Announcement } from '../assistant-voice/announcer';
import type { Clock } from '../clock';
import { OggOpusWriter } from '../talk/ogg';
import type { PacketSink } from '../talk/transmission';
import type { CameraParts } from './camera-conversation';
import type { OpenLive } from './channel-conversation';
import { ReachRefusedError } from './reach-errors';
import type { ResolvedTarget } from './targets';
import { SpeakerPacer } from './voice-pacing';

export const FEED_TAIL_MS = 1500;

export type Announce = (request: AnnounceRequest) => Promise<Announcement>;

export interface AnnouncingDeps {
  readonly announce: Announce;
  readonly camera: CameraParts;
  readonly openLive: OpenLive;
  readonly deliver: (clientId: string, notice: AiSpeechNotice) => number;
  readonly aiName: () => string;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

export interface SpeakJob {
  readonly id: string;
  readonly profileId: string;
  readonly clientId: string | null;
  readonly text: string;
  readonly target: ResolvedTarget;
  readonly done: (failure: string | null) => void;
}

interface Output {
  readonly packet: (packet: Uint8Array) => void;
  readonly finish: (done: (failure: string | null) => void) => void;
  readonly close: () => void;
}

function sinkOf(deps: AnnouncingDeps, job: SpeakJob): PacketSink {
  const { target } = job;
  if (target.kind === 'camera') {
    const sink = deps.camera.speakers.open(target.device.id, job.id, 'assistant');
    if (sink === null) {
      throw new ReachRefusedError(`${target.label}’s speaker is in use right now.`);
    }
    return sink;
  }
  if (target.kind === 'channel') {
    const opened = deps.openLive(target.channel.id, {
      conversationId: job.id,
      label: deps.aiName(),
    });
    if (!opened.ok) {
      throw new ReachRefusedError(
        `Someone is talking on ${target.label} right now; try again shortly.`,
      );
    }
    return { packet: opened.live.speak, end: opened.live.end };
  }
  throw new ReachRefusedError('An app plays speech itself.');
}

function speakerOutput(deps: AnnouncingDeps, job: SpeakJob): Output {
  const sink = sinkOf(deps, job);
  const pacer = new SpeakerPacer(deps.clock, sink.packet);
  return {
    packet: (packet): void => {
      pacer.push(packet);
    },
    finish: (done): void => {
      pacer.whenDrained(() => {
        deps.clock.at(new Date(deps.clock.now().getTime() + FEED_TAIL_MS), () => {
          done(null);
        });
      });
    },
    close: (): void => {
      pacer.stop();
      sink.end();
    },
  };
}

function appOutput(deps: AnnouncingDeps, job: SpeakJob, client: string): Output {
  const pages: Buffer[] = [];
  const writer = new OggOpusWriter(Math.floor(Math.random() * 0xffffffff), (page) => {
    pages.push(page);
  });
  writer.start();
  return {
    packet: (packet): void => {
      writer.packet(packet);
    },
    finish: (done): void => {
      writer.end();
      const audio = Buffer.concat(pages).toString('base64');
      if (audio.length > AI_SPEECH_AUDIO_MAX) {
        done('That was too long to send to an app; say it in shorter parts.');
        return;
      }
      const notice: AiSpeechNotice = {
        type: 'ai_speech',
        id: job.id,
        from: deps.aiName(),
        text: job.text,
        audio,
      };
      done(
        deps.deliver(client, notice) > 0 ? null : 'The app disconnected before it could play this.',
      );
    },
    close: (): void => undefined,
  };
}

function outputOf(deps: AnnouncingDeps, job: SpeakJob): Output {
  return job.target.kind === 'app'
    ? appOutput(deps, job, job.target.client.id)
    : speakerOutput(deps, job);
}

function sinkFor(output: Output, settle: (failure: string | null) => void): AnnounceSink {
  return {
    audio: output.packet,
    said: (): void => {
      output.finish(settle);
    },
    ended: (reason: CallEnding, detail: string | null): void => {
      settle(
        reason === 'finished'
          ? null
          : `The voice service stopped (${detail ?? 'no reason given'}).`,
      );
    },
  };
}

export async function speakOnce(deps: AnnouncingDeps, job: SpeakJob): Promise<void> {
  const output = outputOf(deps, job);
  const holder: { current: Announcement | null; finished: boolean } = {
    current: null,
    finished: false,
  };
  let settled: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    settled = resolve;
  });
  const settle = (failure: string | null): void => {
    if (holder.finished) {
      return;
    }
    holder.finished = true;
    output.close();
    void holder.current?.end(failure === null ? 'finished' : 'failed');
    job.done(failure);
    settled();
  };
  const sink = sinkFor(output, settle);
  const started = deps
    .announce({
      id: job.id,
      profileId: job.profileId,
      clientId: job.clientId,
      text: job.text,
      sink,
    })
    .then(
      (announcement) => {
        holder.current = announcement;
        if (holder.finished) {
          void announcement.end('failed');
        }
      },
      (cause: unknown) => {
        settle(cause instanceof Error ? cause.message : String(cause));
      },
    );
  await Promise.race([started, ended]);
}
