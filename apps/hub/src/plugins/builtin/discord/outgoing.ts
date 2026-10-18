import { randomBytes } from 'node:crypto';
import type { Embed } from './embeds';

export interface Rich {
  readonly content: string;
  readonly embeds?: readonly Embed[] | undefined;
}

export interface SendOptions {
  readonly replyTo?: string | undefined;
  readonly notify?: string | undefined;
}

export const NO_MENTIONS = { parse: [], replied_user: false } as const;

const NONCE_BYTES = 12;

export function newNonce(): string {
  return randomBytes(NONCE_BYTES).toString('hex');
}

export function withMention(content: string, options: SendOptions): string {
  const { notify, replyTo } = options;
  if (notify === undefined || replyTo !== undefined || new RegExp(`<@!?${notify}>`).test(content)) {
    return content;
  }
  return `<@${notify}> ${content}`.trim();
}

export function mentionRule(options: SendOptions): Readonly<Record<string, unknown>> {
  return options.notify === undefined
    ? NO_MENTIONS
    : { ...NO_MENTIONS, users: [options.notify], replied_user: options.replyTo !== undefined };
}

export interface Part {
  readonly content: string;
  readonly index: number;
  readonly count: number;
  readonly message: Rich;
}

export function partBody(part: Part, options: SendOptions): Readonly<Record<string, unknown>> {
  const { content, index, count, message } = part;
  const first = index === 0;
  return {
    content,
    ...(index === count - 1 && message.embeds !== undefined && message.embeds.length > 0
      ? { embeds: message.embeds }
      : {}),
    allowed_mentions: first ? mentionRule(options) : NO_MENTIONS,
    nonce: newNonce(),
    enforce_nonce: true,
    ...(first && options.replyTo !== undefined
      ? { message_reference: { message_id: options.replyTo, fail_if_not_exists: false } }
      : {}),
  };
}

export interface OutFile {
  readonly data: Buffer;
  readonly name: string;
  readonly contentType: string;
}

export interface Delivery {
  readonly content: string;
  readonly files?: readonly OutFile[] | undefined;
  readonly components?: readonly unknown[] | undefined;
  readonly embeds?: readonly Embed[] | undefined;
  readonly status?: boolean | undefined;
}
