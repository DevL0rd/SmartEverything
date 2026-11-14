import { useReducer } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { BandFitting } from '../../../components/widget-board/action-band';
import {
  BAND_FIT_START,
  bandFitAfter,
  oneRowBand,
  type BandFit,
  type BandLayout,
} from '../../../components/widget-board/band-fit';
import type { FrameClass } from '../../../components/widget-board/frame-class';
import {
  LOG_ROOM_START,
  logRoomAfter,
  type LogFit,
  type LogMeasure,
  type LogRoom,
} from './wide-log';

const ROUNDING_PX = 0.5;

export interface SlotRoom {
  readonly room: number | null;
  readonly need: number | null;
}

export type SlotName = 'graph' | 'ticker';

export interface CardFit {
  readonly log: LogRoom;
  readonly graph: SlotRoom;
  readonly ticker: SlotRoom;
  readonly band: BandFit;
}

export type CardMeasure =
  | { readonly part: 'log'; readonly measure: LogMeasure }
  | {
      readonly part: SlotName;
      readonly side: keyof SlotRoom;
      readonly px: number;
    }
  | { readonly part: 'band'; readonly layout: BandLayout };

const SLOT_START: SlotRoom = { room: null, need: null };

export const CARD_FIT_START: CardFit = {
  log: LOG_ROOM_START,
  graph: SLOT_START,
  ticker: SLOT_START,
  band: BAND_FIT_START,
};

export function slotFits({ room, need }: SlotRoom): boolean {
  return room !== null && need !== null && need <= room + ROUNDING_PX;
}

function partAfter(fit: CardFit, measure: CardMeasure): Partial<CardFit> | null {
  if (measure.part === 'log') {
    const log = logRoomAfter(fit.log, measure.measure);
    return log === fit.log ? null : { log };
  }
  if (measure.part === 'band') {
    const band = bandFitAfter(fit.band, measure.layout);
    return band === fit.band ? null : { band };
  }
  const slot = fit[measure.part];
  if (slot[measure.side] === measure.px) {
    return null;
  }
  const next: SlotRoom = { ...slot, [measure.side]: measure.px };
  return measure.part === 'graph' ? { graph: next } : { ticker: next };
}

export function cardFitAfter(fit: CardFit, measure: CardMeasure): CardFit {
  const part = partAfter(fit, measure);
  return part === null ? fit : { ...fit, ...part };
}

export interface SlotFit {
  readonly fits: boolean;
  readonly onRoom: (event: LayoutChangeEvent) => void;
  readonly onNeed: (event: LayoutChangeEvent) => void;
}

export interface CardFitting {
  readonly log: LogFit;
  readonly graph: SlotFit;
  readonly ticker: SlotFit;
  readonly band: BandFitting;
}

function heightOf(event: LayoutChangeEvent): number {
  return event.nativeEvent.layout.height;
}

function slotFitOf(slot: SlotRoom, part: SlotName, measure: (next: CardMeasure) => void): SlotFit {
  return {
    fits: slotFits(slot),
    onRoom: (event): void => {
      measure({ part, side: 'room', px: heightOf(event) });
    },
    onNeed: (event): void => {
      measure({ part, side: 'need', px: heightOf(event) });
    },
  };
}

function logFitOf(log: LogRoom, measure: (next: CardMeasure) => void): LogFit {
  const logMeasure = (next: LogMeasure): void => {
    measure({ part: 'log', measure: next });
  };
  return {
    stage: log.stage,
    onSlack: (px): void => {
      logMeasure({ kind: 'slack', px });
    },
    onNeed: (event): void => {
      logMeasure({ kind: 'need', px: heightOf(event) });
    },
    onGot: (event): void => {
      logMeasure({ kind: 'got', px: heightOf(event) });
    },
  };
}

export function useCardFit(cls: FrameClass): CardFitting {
  const [fit, measure] = useReducer(cardFitAfter, CARD_FIT_START);
  return {
    log: logFitOf(fit.log, measure),
    graph: slotFitOf(fit.graph, 'graph', measure),
    ticker: slotFitOf(fit.ticker, 'ticker', measure),
    band: {
      oneRow: oneRowBand(cls),
      fit: fit.band,
      measure: (layout): void => {
        measure({ part: 'band', layout });
      },
    },
  };
}
