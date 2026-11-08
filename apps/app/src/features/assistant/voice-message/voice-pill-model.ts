import { ASSISTANT_LEVEL_WINDOW_MS } from '@smarteverything/domain';
import { playTime } from '../../../format/time';

export type PillPhase = 'loading' | 'failed' | 'ready';

export interface PillStatus {
  readonly playing: boolean;
  readonly duration: number;
  readonly currentTime: number;
}

export interface PillFacts {
  readonly linkState: 'loading' | 'ready' | 'failed';
  readonly loading: boolean;
  readonly failed: boolean;
  readonly status: PillStatus | null;
  readonly levelCount: number;
  readonly mine: boolean;
  readonly played: boolean;
}

export interface PillView {
  readonly phase: PillPhase;
  readonly playing: boolean;
  readonly duration: number;
  readonly time: string | null;
  readonly speed: boolean;
  readonly unplayed: boolean;
  readonly scrubbable: boolean;
}

export function levelSeconds(levelCount: number): number {
  return (Math.max(0, levelCount) * ASSISTANT_LEVEL_WINDOW_MS) / 1000;
}

function phaseOf(facts: PillFacts): PillPhase {
  if (facts.linkState === 'loading' || facts.loading) return 'loading';
  return facts.linkState === 'failed' || facts.failed ? 'failed' : 'ready';
}

function timeOf(status: PillStatus | null, duration: number): string | null {
  if (status !== null && status.currentTime > 0) {
    return playTime(Math.min(status.currentTime, duration > 0 ? duration : status.currentTime));
  }
  return duration > 0 ? playTime(duration) : null;
}

export function pillViewOf(facts: PillFacts): PillView {
  const phase = phaseOf(facts);
  const known = facts.status?.duration ?? 0;
  const loaded = known > 0;
  const duration = loaded ? known : levelSeconds(facts.levelCount);
  return {
    phase,
    playing: phase !== 'failed' && facts.status?.playing === true,
    duration,
    time: timeOf(facts.status, duration),
    speed: phase !== 'failed' && facts.played,
    unplayed: !facts.mine && !facts.played,
    scrubbable: phase === 'ready' && loaded,
  };
}

export function sentencesOf(text: string): readonly string[] {
  return text.match(/[^.!?…]+(?:[.!?…]+\s*|$)/gu) ?? [text];
}

export function spokenSentence(sentences: readonly string[], share: number): number {
  if (sentences.length === 0 || !Number.isFinite(share) || share < 0) return -1;
  const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
  const reached = Math.min(1, share) * total;
  let passed = 0;
  for (const [index, sentence] of sentences.entries()) {
    passed += sentence.length;
    if (reached < passed) return index;
  }
  return sentences.length - 1;
}

export function transcriptCopy(text: string | null | undefined): {
  readonly text: string;
  readonly spoken: boolean;
} {
  if (text === '(no speech)') return { text: 'No speech was detected.', spoken: false };
  if (text === null || text === undefined || text === '') {
    return { text: 'Transcript is not available yet.', spoken: false };
  }
  return { text, spoken: true };
}
