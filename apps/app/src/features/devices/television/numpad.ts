import { type TvKey } from '@smarteverything/domain';
import { digitKeyOf } from './keyboard';
import type { TvView } from './view';

export function canUseNumberPad(view: TvView): boolean {
  return view.mode === 'on' && (view.locks.n0 === undefined || view.canSetChannel);
}

export type ChannelSend =
  | { readonly kind: 'keys'; readonly keys: readonly TvKey[] }
  | { readonly kind: 'channel'; readonly channel: number };

export function channelSend(view: TvView, typed: string): ChannelSend | null {
  if (typed === '') {
    return null;
  }
  if (view.locks.n0 === undefined) {
    const keys = Array.from(typed).flatMap((digit) => {
      const key = digitKeyOf(digit);
      return key === null ? [] : [key];
    });
    return { kind: 'keys', keys: [...keys, 'ok'] };
  }
  const channel = Number(typed);
  const range = view.channelRange;
  const inRange = range === null || (channel >= range.min && channel <= range.max);
  return view.canSetChannel && inRange ? { kind: 'channel', channel } : null;
}
