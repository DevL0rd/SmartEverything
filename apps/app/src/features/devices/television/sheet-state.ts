import { useReducer } from 'react';
import { MAX_CHANNEL_DIGITS } from './keys';

export type TvSheet =
  | null
  | { readonly kind: 'volume' | 'inputs' | 'apps' | 'sleep' }
  | { readonly kind: 'numpad'; readonly typed: string };

export type SheetKind = Exclude<TvSheet, null>['kind'];

type SheetAction =
  | { readonly type: 'open'; readonly kind: SheetKind; readonly typed?: string }
  | { readonly type: 'close' }
  | { readonly type: 'digit'; readonly digit: string }
  | { readonly type: 'erase' };

function opened(kind: SheetKind, typed: string | undefined): TvSheet {
  return kind === 'numpad' ? { kind, typed: (typed ?? '').slice(0, MAX_CHANNEL_DIGITS) } : { kind };
}

function typedOn(sheet: TvSheet, change: (typed: string) => string): TvSheet {
  return sheet?.kind === 'numpad' ? { kind: 'numpad', typed: change(sheet.typed) } : sheet;
}

export function sheetReducer(sheet: TvSheet, action: SheetAction): TvSheet {
  switch (action.type) {
    case 'open':
      return opened(action.kind, action.typed);
    case 'close':
      return null;
    case 'digit':
      return typedOn(sheet, (typed) =>
        typed.length < MAX_CHANNEL_DIGITS ? typed + action.digit : typed,
      );
    case 'erase':
      return typedOn(sheet, (typed) => typed.slice(0, -1));
  }
}

export interface TvSheets {
  readonly sheet: TvSheet;
  readonly open: (kind: SheetKind, typed?: string) => void;
  readonly close: () => void;
  readonly digit: (digit: string) => void;
  readonly erase: () => void;
}

export function useTvSheets(): TvSheets {
  const [sheet, dispatch] = useReducer(sheetReducer, null);
  return {
    sheet,
    open: (kind, typed): void => {
      dispatch(typed === undefined ? { type: 'open', kind } : { type: 'open', kind, typed });
    },
    close: (): void => {
      dispatch({ type: 'close' });
    },
    digit: (digit): void => {
      dispatch({ type: 'digit', digit });
    },
    erase: (): void => {
      dispatch({ type: 'erase' });
    },
  };
}
