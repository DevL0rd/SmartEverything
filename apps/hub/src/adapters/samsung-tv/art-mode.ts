import { randomUUID } from 'node:crypto';
import type { Logger } from '@smarteverything/logging';
import {
  artModeStatusRequest,
  remoteUrl,
  setArtModeRequest,
  type TvMessage,
} from '@smarteverything/smartthings';
import { TvConnection } from './connection';
import type { SamsungTvIo } from './io';
import { REMOTE_APP_NAME } from './link';
import { ReusedConnection } from './reused-connection';

const ART_CONNECT_TIMEOUT_MS = 10_000;

const ART_ANSWER_TIMEOUT_MS = 5000;

export class TvArtModeError extends Error {
  override readonly name = 'TvArtModeError';

  constructor(
    readonly host: string,
    readonly request: string,
    readonly reason: string,
  ) {
    super(`The Frame TV at ${host} did not complete the art mode request ${request}: ${reason}.`);
  }
}

type ArtAnswer = Extract<TvMessage, { kind: 'art_mode' | 'art_failed' | 'art_other' }>;

function answerTo(id: string): (message: TvMessage) => ArtAnswer | undefined {
  return (message) =>
    (message.kind === 'art_mode' ||
      message.kind === 'art_failed' ||
      message.kind === 'art_other') &&
    message.requestId === id
      ? message
      : undefined;
}

export interface ArtModeOptions {
  readonly host: () => string;
  readonly io: SamsungTvIo;
  readonly log: Logger;
  readonly token: () => string;
  readonly onArtMode: (on: boolean) => void;
  readonly onToken: (token: string | null) => Promise<void>;
}

export class ArtModeChannel {
  private readonly socket = new ReusedConnection(() => this.open());

  constructor(private readonly options: ArtModeOptions) {}

  async status(): Promise<boolean> {
    const request = 'get_artmode_status';
    const answer = await this.ask(request, artModeStatusRequest);
    if (answer.kind !== 'art_mode') {
      throw new TvArtModeError(
        this.options.host(),
        request,
        `the answer ${answer.event} carried no art mode`,
      );
    }
    return answer.on;
  }

  async set(on: boolean): Promise<void> {
    await this.ask('set_artmode_status', (id) => setArtModeRequest(id, on));
  }

  close(): void {
    this.socket.close();
  }

  private async ask(
    request: string,
    build: (id: string) => string,
  ): Promise<Exclude<ArtAnswer, { kind: 'art_failed' }>> {
    const connection = await this.socket.get();
    const id = randomUUID();
    const [answer] = await Promise.all([
      connection.waitFor(
        answerTo(id),
        ART_ANSWER_TIMEOUT_MS,
        `the TV did not answer ${request} in time`,
      ),
      connection.send(build(id)),
    ]);
    if (answer.kind === 'art_failed') {
      const code = answer.errorCode;
      throw new TvArtModeError(
        this.options.host(),
        request,
        code === null
          ? 'the TV answered with an error without a code'
          : `the TV answered with error ${code}`,
      );
    }
    return answer;
  }

  private async open(): Promise<TvConnection> {
    const { io, log } = this.options;
    const host = this.options.host();
    const socket = io.openSocket(remoteUrl(host, 'art', REMOTE_APP_NAME, this.options.token()));
    const connection = await TvConnection.open(socket, host, ART_CONNECT_TIMEOUT_MS, 'ready');
    connection.onMessage((message) => {
      if (message.kind === 'art_mode') {
        this.options.onArtMode(message.on);
      }
    });
    connection.onProblem((problem) => {
      log.warn('art.problem', { host, reason: problem.message });
    });
    await this.options.onToken(connection.token);
    return connection;
  }
}
