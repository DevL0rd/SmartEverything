import { DiscordAPIError, HTTPError, REST, RequestMethod, type RawFile } from '@discordjs/rest';
import { WebSocketManager, WebSocketShardEvents } from '@discordjs/ws';
import {
  AUTH_FAILED_CODE,
  DISALLOWED_INTENTS_CODE,
  DiscordAuthError,
  DiscordRequestError,
  type DiscordFile,
  type DiscordLink,
  type DiscordLinkFactory,
  type DiscordRest,
  type LinkHandlers,
  type RestCalls,
} from './link';

const API_VERSION = '10';
const REQUEST_TIMEOUT_MS = 15_000;

type Route = `/${string}`;

interface Request {
  readonly auth: boolean;
  readonly method: RequestMethod;
  readonly route: string;
  readonly body?: unknown;
  readonly query?: URLSearchParams | undefined;
  readonly reason?: string | undefined;
  readonly files?: readonly DiscordFile[] | undefined;
}

function isRoute(value: string): value is Route {
  return value.startsWith('/');
}

function statusOf(cause: unknown): number | null {
  return cause instanceof DiscordAPIError || cause instanceof HTTPError ? cause.status : null;
}

function rawFile(file: DiscordFile): RawFile {
  return { name: file.name, data: file.data, contentType: file.contentType };
}

class RestClient implements RestCalls {
  private rejected = false;

  constructor(
    private readonly rest: REST,
    private readonly auth: boolean,
  ) {}

  get = (route: string, query?: URLSearchParams): Promise<unknown> =>
    this.send({ auth: this.auth, method: RequestMethod.Get, route, query });

  post = (route: string, body: unknown): Promise<unknown> =>
    this.send({ auth: this.auth, method: RequestMethod.Post, route, body });

  postFiles = (route: string, body: unknown, files: readonly DiscordFile[]): Promise<unknown> =>
    this.send({ auth: this.auth, method: RequestMethod.Post, route, body, files });

  patch = (route: string, body: unknown, reason?: string): Promise<unknown> =>
    this.send({ auth: this.auth, method: RequestMethod.Patch, route, body, reason });

  put = (route: string, body?: unknown, reason?: string): Promise<unknown> =>
    this.send({ auth: this.auth, method: RequestMethod.Put, route, body, reason });

  delete = (route: string, reason?: string): Promise<unknown> =>
    this.send({ auth: this.auth, method: RequestMethod.Delete, route, reason });

  private async send(request: Request): Promise<unknown> {
    const { route } = request;
    if (!isRoute(route)) {
      throw new Error(`A Discord route starts with / and ${route} does not`);
    }
    if (this.rejected) {
      throw new DiscordAuthError();
    }
    try {
      return await this.rest.request({
        method: request.method,
        fullRoute: route,
        auth: request.auth,
        ...(request.body === undefined ? {} : { body: request.body }),
        ...(request.query === undefined ? {} : { query: request.query }),
        ...(request.reason === undefined ? {} : { reason: request.reason }),
        ...(request.files === undefined ? {} : { files: request.files.map(rawFile) }),
      });
    } catch (cause) {
      const status = statusOf(cause);
      this.rejected = status === 401;
      throw new DiscordRequestError(status, route);
    }
  }
}

function bindShards(sockets: WebSocketManager, handlers: LinkHandlers): void {
  sockets.on(WebSocketShardEvents.Dispatch, (payload) => {
    handlers.packet({ t: payload.t, d: payload.d });
  });
  sockets.on(WebSocketShardEvents.Ready, () => {
    handlers.state('ready', null);
  });
  sockets.on(WebSocketShardEvents.Resumed, () => {
    handlers.state('ready', null);
  });
  sockets.on(WebSocketShardEvents.Hello, () => {
    handlers.state('connecting', null);
  });
  sockets.on(WebSocketShardEvents.Closed, (code) => {
    if (code === DISALLOWED_INTENTS_CODE) {
      handlers.state(
        'error',
        'Discord refused the privileged intents. In the Discord Developer Portal, Bot page, turn on Message Content Intent and Server Members Intent, or switch them off here.',
      );
    } else if (code === AUTH_FAILED_CODE) {
      handlers.state('error', 'Discord rejected the bot token');
    } else {
      handlers.state('reconnecting', null);
    }
  });
  sockets.on(WebSocketShardEvents.Error, (error) => {
    handlers.state('error', error.message);
  });
}

const SNOWFLAKE_SHARD_SHIFT = 22n;

function shardOf(guildId: string, count: number): number {
  return Number((BigInt(guildId) >> SNOWFLAKE_SHARD_SHIFT) % BigInt(count));
}

export const connectDiscord: DiscordLinkFactory = (options): DiscordLink => {
  const sdk = new REST({ version: API_VERSION, retries: 0, timeout: REQUEST_TIMEOUT_MS });
  sdk.setToken(options.token);
  const sockets = new WebSocketManager({
    token: options.token,
    intents: options.intents,
    rest: sdk,
  });
  const rest: DiscordRest = Object.assign(new RestClient(sdk, true), {
    anonymous: new RestClient(sdk, false),
  });
  let shards = 1;
  return {
    rest,
    send: async (guildId, payload): Promise<void> => {
      await sockets.send(shardOf(guildId, shards), payload);
    },
    connect: async (handlers): Promise<void> => {
      bindShards(sockets, handlers);
      handlers.state('connecting', null);
      await sockets.connect();
      shards = await sockets.getShardCount();
    },
    close: async (): Promise<void> => {
      await sockets.destroy();
    },
  };
};
