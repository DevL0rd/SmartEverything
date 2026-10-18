import {
  listeningKeyOf,
  listeningKindOf,
  type ListeningSource,
  type ListeningSourceKind,
  type WakeArbitrated,
  type WakeDecider,
} from '@smarteverything/domain';
import { dbLabel } from './listening-model';

export const CONTEST_WINDOW_MS = 1000;

const SHORT_AXIS_MS = 2000;

const LONG_AXIS_MS = 3000;

export type ClaimOutcome = 'answered' | 'took_over' | 'handed_over' | 'stood_down' | 'late';

export const OUTCOME_LABELS: Readonly<Record<ClaimOutcome, string>> = {
  answered: 'Answered',
  took_over: 'Took over',
  handed_over: 'Handed over',
  stood_down: 'Stood down',
  late: 'Arrived late',
};

export function outcomeWon(outcome: ClaimOutcome): boolean {
  return outcome === 'answered' || outcome === 'took_over';
}

export interface ContestLine {
  readonly name: string;
  readonly kind: ListeningSourceKind;
  readonly dbfs: number;
  readonly afterMs: number;
  readonly outcome: ClaimOutcome;
}

export interface ContestModel {
  readonly at: string;
  readonly title: string;
  readonly badge: string | null;
  readonly summary: string;
  readonly lines: readonly ContestLine[];
  readonly axisMs: number;
}

const GENERIC_NAMES: Readonly<Record<ListeningSourceKind, string>> = {
  camera: 'A camera',
  phone: 'A phone',
  computer: 'A computer',
  discord: 'Discord call',
  walkie: 'A walkie channel',
};

type ContestClaim = WakeArbitrated['claims'][number];

function nameOf(claim: ContestClaim, sources: readonly ListeningSource[]): string {
  const kind = listeningKindOf(claim.source);
  const key = listeningKeyOf(claim.source, claim.key);
  const found = sources.find((source) => source.key === key);
  if (kind === 'discord' || found === undefined) return GENERIC_NAMES[kind];
  return kind === 'walkie' ? `Walkie · ${found.name}` : found.name;
}

function outcomeOf(claim: ContestClaim): ClaimOutcome {
  if (claim.outcome === 'won') return claim.afterMs > 0 ? 'took_over' : 'answered';
  if (claim.outcome === 'superseded') return 'handed_over';
  return claim.afterMs < CONTEST_WINDOW_MS ? 'stood_down' : 'late';
}

function linesOf(
  arbitrated: WakeArbitrated,
  sources: readonly ListeningSource[],
): readonly ContestLine[] {
  return arbitrated.claims.map((claim) => ({
    name: nameOf(claim, sources),
    kind: listeningKindOf(claim.source),
    dbfs: claim.snippetDbfs,
    afterMs: claim.afterMs,
    outcome: outcomeOf(claim),
  }));
}

function others(count: number): string {
  return count === 1 ? 'One other source heard it' : `${String(count)} other sources heard it`;
}

function summaryOf(
  decider: WakeDecider,
  winner: ContestLine,
  lines: readonly ContestLine[],
): string {
  const first = lines.find((line) => line.afterMs === 0);
  switch (decider) {
    case 'discord':
      return 'A wake heard in a voice channel always wins, quieter or not. The reply went into the call.';
    case 'computer':
      return 'A wake heard by a computer comes before cameras and phones, quieter or not. The reply was spoken on the computer.';
    case 'walkie':
      return 'A walkie wake comes before cameras, phones and computers. The reply was spoken on the channel.';
    case 'only':
      return `Only one source heard it, at ${dbLabel(winner.dbfs)}.`;
    case 'loudest':
      return winner.outcome === 'took_over' && first !== undefined
        ? `Louder than ${first.name}, even after its greeting had begun.`
        : `Loudest at ${dbLabel(winner.dbfs)}. ${others(lines.length - 1)}.`;
  }
}

function titleOf(decider: WakeDecider, winner: ContestLine): string {
  if (decider === 'discord') return 'Discord call answered';
  return winner.outcome === 'took_over' && decider === 'loudest'
    ? `${winner.name} took over`
    : `${winner.name} answered`;
}

const BADGES: Readonly<Partial<Record<WakeDecider, string>>> = {
  discord: 'Priority',
  walkie: 'Walkie first',
};

export function contestOf(
  arbitrated: WakeArbitrated,
  sources: readonly ListeningSource[],
): ContestModel | null {
  const lines = linesOf(arbitrated, sources);
  const winner = lines.find((line) => outcomeWon(line.outcome));
  if (winner === undefined) return null;
  const latest = Math.max(...lines.map((line) => line.afterMs));
  return {
    at: arbitrated.at,
    title: titleOf(arbitrated.decidedBy, winner),
    badge: BADGES[arbitrated.decidedBy] ?? null,
    summary: summaryOf(arbitrated.decidedBy, winner, lines),
    lines,
    axisMs: latest > SHORT_AXIS_MS ? LONG_AXIS_MS : SHORT_AXIS_MS,
  };
}
