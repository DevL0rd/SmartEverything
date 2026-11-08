import { useEffect, useState } from 'react';
import type { DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useDriveLink } from '../../nas/data';

const log = new Logger('app.drive');

export const TEXT_HEAD_BYTES = 64 * 1024;

export interface TextHead {
  readonly text: string;
  readonly shownBytes: number;
  readonly partial: boolean;
}

class TextHeadReadError extends Error {
  override readonly name = 'TextHeadReadError';
}

export type FetchText = (url: string, init: RequestInit) => Promise<Response>;

export function decodeHead(data: Uint8Array, total: number): TextHead {
  const head = data.subarray(0, TEXT_HEAD_BYTES);
  const partial = head.byteLength < total;
  const text = new TextDecoder('utf-8').decode(head, { stream: partial });
  return { text, shownBytes: head.byteLength, partial };
}

export async function readTextHead(
  url: string,
  total: number,
  fetchText: FetchText,
): Promise<TextHead> {
  if (total === 0) return { text: '', shownBytes: 0, partial: false };
  const end = Math.min(total, TEXT_HEAD_BYTES) - 1;
  const response = await fetchText(url, { headers: { Range: `bytes=0-${String(end)}` } });
  if (!response.ok) throw new TextHeadReadError(`The hub answered ${String(response.status)}.`);
  return decodeHead(new Uint8Array(await response.arrayBuffer()), total);
}

export type TextHeadState =
  | { readonly state: 'loading' }
  | { readonly state: 'failed' }
  | { readonly state: 'ready'; readonly head: TextHead };

interface Settled {
  readonly key: string;
  readonly value: TextHeadState;
}

export function useTextHead(item: DriveItem): TextHeadState {
  const url = useDriveLink(item.id, item.rev, 'file');
  const total = item.kind === 'folder' ? 0 : item.bytes;
  const key = `${item.id}:${String(item.rev)}`;
  const [settled, setSettled] = useState<Settled | null>(null);
  useEffect(() => {
    if (url === null) return undefined;
    let current = true;
    readTextHead(url, total, (target, init) => fetch(target, init))
      .then((head) => {
        if (current) setSettled({ key, value: { state: 'ready', head } });
      })
      .catch((error: unknown) => {
        log.warn('quick_look.text_head_failed', { reason: String(error) });
        if (current) setSettled({ key, value: { state: 'failed' } });
      });
    return (): void => {
      current = false;
    };
  }, [url, total, key]);
  return settled?.key === key ? settled.value : { state: 'loading' };
}
