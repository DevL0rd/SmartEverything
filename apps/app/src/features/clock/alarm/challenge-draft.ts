import {
  PLANNER_MATHS_DIFFICULTIES,
  plannerMathsProblemsOf,
  type PlannerChallenge,
} from '@smarteverything/domain';
import { plural } from '../../../format/text';

export type ChallengeKind = PlannerChallenge['kind'];

export type MathsDifficulty = (typeof PLANNER_MATHS_DIFFICULTIES)[number];

export type MathsChallenge = Extract<PlannerChallenge, { readonly kind: 'maths' }>;

export const CHALLENGE_OPTIONS: readonly {
  readonly value: ChallengeKind;
  readonly label: string;
}[] = [
  { value: 'none', label: 'None' },
  { value: 'maths', label: 'Maths' },
  { value: 'qr', label: 'QR code' },
  { value: 'steps', label: 'Steps' },
];

export const DIFFICULTY_OPTIONS: readonly {
  readonly value: MathsDifficulty;
  readonly label: string;
}[] = PLANNER_MATHS_DIFFICULTIES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

export const FIRST_MATHS: MathsChallenge = { kind: 'maths', difficulty: 'medium', count: 3 };

export const FIRST_STEPS = 30;

const SAMPLE_SEED = 'sample';

const NONE: PlannerChallenge = { kind: 'none' };

export function challengeOfKind(
  kind: ChallengeKind,
  current: PlannerChallenge,
): PlannerChallenge | null {
  if (kind === current.kind) return current;
  switch (kind) {
    case 'none':
      return NONE;
    case 'maths':
      return FIRST_MATHS;
    case 'steps':
      return { kind: 'steps', steps: FIRST_STEPS };
    case 'qr':
      return null;
  }
}

export function mathsEdit(
  current: MathsChallenge,
  change: Partial<MathsChallenge>,
): PlannerChallenge {
  return { ...current, ...change, kind: 'maths' };
}

export function sampleProblemOf(difficulty: MathsDifficulty): string {
  const [sample] = plannerMathsProblemsOf(SAMPLE_SEED, difficulty, 1);
  return sample?.text ?? '';
}

export function qrCodeOf(scanned: string): string | null {
  return scanned.trim() === '' ? null : scanned;
}

export function qrChallengeOf(scanned: string): PlannerChallenge | null {
  const code = qrCodeOf(scanned);
  return code === null ? null : { kind: 'qr', code };
}

export function challengeTextOf(challenge: PlannerChallenge): string | null {
  switch (challenge.kind) {
    case 'none':
      return null;
    case 'maths':
      return plural(challenge.count, `${challenge.difficulty} problem`);
    case 'qr':
      return 'Scan the QR code';
    case 'steps':
      return plural(challenge.steps, 'step');
  }
}

export function challengeSummaryOf(challenge: PlannerChallenge): string {
  switch (challenge.kind) {
    case 'none':
      return 'Stop with one swipe.';
    case 'maths':
      return `Solve ${plural(challenge.count, `${challenge.difficulty} problem`)} to stop it.`;
    case 'qr':
      return 'Scan the registered code to stop it.';
    case 'steps':
      return `Walk ${plural(challenge.steps, 'step')} to stop it.`;
  }
}

export function needsPhone(challenge: PlannerChallenge): boolean {
  return challenge.kind === 'qr' || challenge.kind === 'steps';
}

export interface ChallengePlaces {
  readonly phone: boolean;
  readonly watch: boolean;
}

export function challengeNotesOf(
  challenge: PlannerChallenge,
  places: ChallengePlaces,
): readonly string[] {
  if (challenge.kind === 'none') return [];
  const notes: string[] = [];
  if (needsPhone(challenge) && !places.phone) {
    notes.push('Ring it on a phone: this challenge needs one.');
  }
  if (places.watch) notes.push('Not sent to the watch, which would stop it without the challenge.');
  if (needsPhone(challenge)) notes.push('On a computer it shows Snooze and Stop it on your phone.');
  return notes;
}
