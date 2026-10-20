import { useCallback, useEffect, useReducer } from 'react';

export interface FollowState {
  readonly on: boolean;
  readonly pending: number;
}

export type FollowEvent =
  { readonly type: 'toggle' } | { readonly type: 'focused' } | { readonly type: 'settled' };

export const FOLLOW_OFF: FollowState = { on: false, pending: 0 };

export function followReduce(state: FollowState, event: FollowEvent): FollowState {
  switch (event.type) {
    case 'toggle':
      return { on: !state.on, pending: 0 };
    case 'focused':
      return state.on ? { ...state, pending: state.pending + 1 } : state;
    case 'settled':
      if (!state.on) return state;
      return state.pending > 0 ? { ...state, pending: state.pending - 1 } : FOLLOW_OFF;
  }
}

export interface Follow {
  readonly on: boolean;
  readonly focusNode: string | null;
  readonly toggle: () => void;
  readonly settled: () => void;
}

export function useFollow(target: string | null, live: boolean): Follow {
  const [state, send] = useReducer(followReduce, FOLLOW_OFF);
  const focusNode = state.on && live ? target : null;
  useEffect(() => {
    if (focusNode !== null) send({ type: 'focused' });
  }, [focusNode]);
  const toggle = useCallback((): void => {
    send({ type: 'toggle' });
  }, []);
  const settled = useCallback((): void => {
    send({ type: 'settled' });
  }, []);
  return { on: state.on, focusNode, toggle, settled };
}
