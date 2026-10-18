import type { VoiceStatePayload } from './voice/link';

export interface DiscordFile {
  readonly data: Buffer;
  readonly name: string;
  readonly contentType: string;
}

export interface RestCalls {
  readonly get: (route: string, query?: URLSearchParams) => Promise<unknown>;
  readonly post: (route: string, body: unknown) => Promise<unknown>;
  readonly postFiles: (
    route: string,
    body: unknown,
    files: readonly DiscordFile[],
  ) => Promise<unknown>;
  readonly patch: (route: string, body: unknown, reason?: string) => Promise<unknown>;
  readonly put: (route: string, body?: unknown, reason?: string) => Promise<unknown>;
  readonly delete: (route: string, reason?: string) => Promise<unknown>;
}

export interface DiscordRest extends RestCalls {
  readonly anonymous: RestCalls;
}

export interface GatewayPacket {
  readonly t: string;
  readonly d: unknown;
}

export type LinkState = 'connecting' | 'ready' | 'reconnecting' | 'disconnected' | 'error';

export interface LinkHandlers {
  readonly packet: (packet: GatewayPacket) => void;
  readonly state: (state: LinkState, detail: string | null) => void;
}

export interface DiscordLink {
  readonly rest: DiscordRest;
  readonly send: (guildId: string, payload: VoiceStatePayload) => Promise<void>;
  readonly connect: (handlers: LinkHandlers) => Promise<void>;
  readonly close: () => Promise<void>;
}

interface LinkOptions {
  readonly token: string;
  readonly intents: number;
}

export type DiscordLinkFactory = (options: LinkOptions) => DiscordLink;

export class DiscordRequestError extends Error {
  override readonly name = 'DiscordRequestError';

  constructor(
    readonly status: number | null,
    readonly route: string,
  ) {
    super(
      status === null
        ? `Discord did not answer ${route} in time or the network failed`
        : `Discord refused ${route} with status ${String(status)}`,
    );
  }
}

export class DiscordAuthError extends Error {
  override readonly name = 'DiscordAuthError';

  constructor() {
    super('Discord rejected the bot token; correct it in the plugin settings');
  }
}

export const INTENTS = {
  guilds: 1 << 0,
  guildMembers: 1 << 1,
  guildVoiceStates: 1 << 7,
  guildMessages: 1 << 9,
  directMessages: 1 << 12,
  messageContent: 1 << 15,
} as const;

export const DISALLOWED_INTENTS_CODE = 4014;

export const AUTH_FAILED_CODE = 4004;
