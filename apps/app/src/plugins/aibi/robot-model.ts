import type { RobotMood } from '../../features/device-visuals';
import type { RobotStatus } from '@smarteverything/domain';
import type { StatusTone } from '../../components/tone';
import { joinParts } from '../../format/text';
import { clock } from '../../format/time';
import { lastHeard } from './aibi-text';
import { robotProblem } from './aibi-data';

interface RobotChip {
  readonly tone: StatusTone | 'neutral';
  readonly label: string;
}

export interface RobotView {
  readonly mood: RobotMood;
  readonly chip: RobotChip;
  readonly words: string;
  readonly line: string;
  readonly critical: boolean;
  readonly problem: boolean;
  readonly settings: boolean;
  readonly quote: string | null;
  readonly asleep: boolean;
}

const MOOD_WORDS: Readonly<Record<RobotMood, string>> = {
  awake: 'Awake',
  listening: 'Listening',
  speaking: 'Speaking',
  worried: 'Needs attention',
  asleep: 'Asleep',
};

const MOOD_TONES: Readonly<Record<RobotMood, StatusTone | 'neutral'>> = {
  awake: 'positive',
  listening: 'info',
  speaking: 'info',
  worried: 'warning',
  asleep: 'neutral',
};

const HEAD_WORDS: Readonly<Partial<Record<RobotMood, string>>> = {
  listening: 'Listening…',
  speaking: 'Answering',
};

const ASLEEP_WORDS = 'Asleep or away from Wi‑Fi';
const CONNECTED_WORDS = 'Connected';

function baseWord(onBase: boolean | null): string | null {
  if (onBase === null) {
    return null;
  }
  return onBase ? 'On its base' : 'Off its base';
}

function seenWord(status: RobotStatus): string | null {
  return status.contact === null ? null : `last seen ${clock(status.contact.at)}`;
}

function chipOf(mood: RobotMood, onBase: boolean | null): RobotChip {
  if (mood === 'awake' && onBase === false) {
    return { tone: 'warning', label: 'Off its base' };
  }
  return { tone: MOOD_TONES[mood], label: MOOD_WORDS[mood] };
}

function quoteOf(status: RobotStatus): string | null {
  const heard = lastHeard(status);
  return heard === null ? null : `${clock(heard.at)} · “${heard.text}”`;
}

export function robotView(status: RobotStatus, mood: RobotMood, onBase: boolean | null): RobotView {
  const problem = robotProblem(status);
  if (problem !== null) {
    return {
      mood,
      chip: {
        tone: problem.tone === 'critical' ? 'critical' : 'warning',
        label: 'Needs attention',
      },
      words: problem.title,
      line: problem.title,
      critical: problem.tone === 'critical',
      problem: true,
      settings: problem.settings,
      quote: null,
      asleep: mood === 'asleep',
    };
  }
  if (mood === 'asleep') {
    return {
      mood,
      chip: chipOf(mood, onBase),
      words: ASLEEP_WORDS,
      line: joinParts([ASLEEP_WORDS, seenWord(status)]),
      critical: false,
      problem: false,
      settings: false,
      quote: null,
      asleep: true,
    };
  }
  const quote = quoteOf(status);
  const joined = joinParts([HEAD_WORDS[mood] ?? null, baseWord(onBase)]);
  const words = joined === '' ? CONNECTED_WORDS : joined;
  return {
    mood,
    chip: chipOf(mood, onBase),
    words,
    line: joinParts([words, quote === null ? seenWord(status) : null]),
    critical: false,
    problem: false,
    settings: false,
    quote,
    asleep: false,
  };
}
