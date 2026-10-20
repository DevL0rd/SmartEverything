import {
  ORALB_KEY,
  decodeOralbValue,
  hexToBytes,
  oralbAdvertDelta,
  oralbShortOf,
  type OralbDelta,
} from '@smarteverything/ble';
import type { BrushAdvert, BrushFrame } from '@smarteverything/domain';
import type { Source } from './state';

interface RawRecord {
  readonly at: string;
  readonly hex: string;
}

export type Decoded =
  | {
      readonly kind: 'delta';
      readonly delta: OralbDelta;
      readonly at: string;
      readonly source: Source;
    }
  | {
      readonly kind: 'unreadable';
      readonly characteristic: string;
      readonly hex: string;
      readonly reason: string;
    };

type Heard =
  | { readonly kind: 'frame'; readonly at: string; readonly frame: BrushFrame }
  | { readonly kind: 'advert'; readonly at: string; readonly advert: BrushAdvert };

const RAW_RECORDS = 30;

const ADVERT = 'advert';

export class OralbDecoder {
  readonly records: RawRecord[] = [];

  decode(
    frames: readonly BrushFrame[],
    adverts: readonly BrushAdvert[],
    protocol: number | null,
  ): Decoded[] {
    const heard: Heard[] = [
      ...frames.map((frame): Heard => ({ kind: 'frame', at: frame.at, frame })),
      ...adverts.map((advert): Heard => ({ kind: 'advert', at: advert.at, advert })),
    ];
    heard.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return heard.flatMap((item) =>
      item.kind === 'frame' ? this.frame(item.frame, protocol) : this.advert(item.advert),
    );
  }

  private advert(advert: BrushAdvert): Decoded[] {
    try {
      return [
        {
          kind: 'delta',
          delta: oralbAdvertDelta(hexToBytes(advert.hex)),
          at: advert.at,
          source: 'advert',
        },
      ];
    } catch (cause) {
      return [unreadable(ADVERT, advert.hex, cause)];
    }
  }

  private frame(frame: BrushFrame, protocol: number | null): Decoded[] {
    try {
      if (oralbShortOf(frame.characteristic) === ORALB_KEY.session) {
        this.note(frame);
      }
      const delta = decodeOralbValue(frame.characteristic, hexToBytes(frame.hex), protocol);
      return delta === null ? [] : [{ kind: 'delta', delta, at: frame.at, source: 'link' }];
    } catch (cause) {
      return [unreadable(frame.characteristic, frame.hex, cause)];
    }
  }

  private note(frame: BrushFrame): void {
    this.records.push({ at: frame.at, hex: frame.hex });
    this.records.splice(0, Math.max(0, this.records.length - RAW_RECORDS));
  }
}

function unreadable(characteristic: string, hex: string, cause: unknown): Decoded {
  return {
    kind: 'unreadable',
    characteristic,
    hex,
    reason: cause instanceof Error ? cause.message : String(cause),
  };
}
