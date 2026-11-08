import { useState } from 'react';
import { useStableCallback } from '../../../../../design/use-stable-callback';
import type { GraphIntentFeedback } from '../graph-canvas-types';

export interface Shown {
  readonly seq: number;
  readonly text: string;
}

export interface FeedbackState {
  readonly polite: Shown | null;
  readonly assertive: Shown | null;
  readonly toast: Shown | null;
}

export const NO_FEEDBACK: FeedbackState = { polite: null, assertive: null, toast: null };

function shown(previous: Shown | null, text: string): Shown {
  return { seq: (previous?.seq ?? 0) + 1, text };
}

export function withAnnouncement(
  state: FeedbackState,
  text: string,
  failed: boolean,
): FeedbackState {
  if (text === '') return state;
  return failed
    ? { ...state, assertive: shown(state.assertive, text) }
    : { ...state, polite: shown(state.polite, text) };
}

export function withFeedback(state: FeedbackState, feedback: GraphIntentFeedback): FeedbackState {
  const announced = withAnnouncement(state, feedback.announcement, feedback.failed);
  if (feedback.toast === null) return announced;
  return { ...announced, toast: shown(state.toast, feedback.toast) };
}

export interface GraphFeedback {
  readonly state: FeedbackState;
  readonly show: (feedback: GraphIntentFeedback | null) => void;
  readonly announce: (text: string) => void;
}

export function useGraphFeedback(): GraphFeedback {
  const [state, setState] = useState(NO_FEEDBACK);
  const show = useStableCallback((feedback: GraphIntentFeedback | null): void => {
    if (feedback !== null) setState((current) => withFeedback(current, feedback));
  });
  const announce = useStableCallback((text: string): void => {
    setState((current) => withAnnouncement(current, text, false));
  });
  return { state, show, announce };
}
