import type {
  PhotoAiModelChoice,
  PhotoAiModels,
  PhotoAiStage,
  PhotoAiStageProgress,
  PhotoAiStatus,
} from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';
import { count, percent } from '../../../format/number';

export interface StageRing {
  readonly stage: PhotoAiStage;
  readonly title: string;
  readonly colour: ColourRole;
  readonly progress: number;
  readonly failedShare: number;
  readonly label: string;
  readonly done: number;
  readonly total: number;
  readonly line: string;
}

const STAGES: readonly {
  readonly stage: PhotoAiStage;
  readonly title: string;
  readonly colour: ColourRole;
}[] = [
  { stage: 'faces', title: 'Faces', colour: 'viz-1' },
  { stage: 'tags', title: 'Tags and captions', colour: 'viz-3' },
  { stage: 'index', title: 'Search index', colour: 'viz-green' },
];

export function stageTotalOf(progress: PhotoAiStageProgress): number {
  return progress.done + progress.queued + progress.failed + progress.needsKey;
}

export function shareOf(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

export function donePercent(done: number, total: number): string {
  if (total > 0 && done >= total) return percent(1);
  return percent(Math.floor(shareOf(done, total) * 100) / 100);
}

export function stageLineOf(progress: PhotoAiStageProgress): string {
  const parts = [
    progress.queued === 0 ? null : `${count(progress.queued)} waiting`,
    progress.failed === 0 ? null : `${count(progress.failed)} failed`,
    progress.needsKey === 0 ? null : `${count(progress.needsKey)} need a key`,
  ].filter((part): part is string => part !== null);
  if (parts.length > 0) return parts.join(' · ');
  return stageTotalOf(progress) === 0 ? 'Nothing to do yet' : 'Up to date';
}

export function stageRingsOf(status: PhotoAiStatus): readonly StageRing[] {
  return STAGES.filter((entry) =>
    entry.stage === 'faces' ? status.faceGrouping : status.smartSearch,
  ).map((entry) => {
    const progress = status[entry.stage];
    const total = stageTotalOf(progress);
    return {
      ...entry,
      progress: shareOf(progress.done, total),
      failedShare: shareOf(progress.failed, total),
      label: donePercent(progress.done, total),
      done: progress.done,
      total,
      line: stageLineOf(progress),
    };
  });
}

export type SmartPhase = 'off' | 'no-key' | 'running' | 'failed' | 'done';

export function smartPhaseOf(status: PhotoAiStatus): SmartPhase {
  if (!status.smartSearch && !status.faceGrouping) return 'off';
  const stages = stageRingsOf(status).map((ring) => status[ring.stage]);
  if (stages.some((stage) => stage.queued > 0)) return 'running';
  if (status.smartSearch && !status.hasKey) return 'no-key';
  if (stages.some((stage) => stage.failed > 0)) return 'failed';
  return 'done';
}

export function failedTotalOf(status: PhotoAiStatus): number {
  return stageRingsOf(status).reduce((sum, ring) => sum + status[ring.stage].failed, 0);
}

export interface SpendView {
  readonly spent: number;
  readonly planned: number;
  readonly progress: number;
}

export function spendOf(status: PhotoAiStatus): SpendView {
  const planned = status.spentMicros + status.estimateMicros;
  return {
    spent: status.spentMicros,
    planned,
    progress: planned === 0 ? 0 : status.spentMicros / planned,
  };
}

export const MODEL_ROWS: readonly {
  readonly id: keyof PhotoAiModels;
  readonly title: string;
  readonly use: string;
}[] = [
  { id: 'vision', title: 'Tags and captions', use: 'Reads what is in each photo' },
  { id: 'embedding', title: 'Search by meaning', use: 'Turns descriptions into search vectors' },
  { id: 'petEmbedding', title: 'Pet matching', use: 'Tells pets apart' },
  { id: 'eraser', title: 'Eraser', use: 'Fills in what the eraser removes' },
];

export interface ModelOption {
  readonly value: string;
  readonly label: string;
  readonly description: string;
}

export function choiceDetailOf(
  choice: PhotoAiModelChoice,
  cost: (micros: number) => string,
): string {
  const price =
    choice.inputPerMtok === null
      ? 'Price varies'
      : `${cost(Math.round(choice.inputPerMtok * 1_000_000))} per million tokens in`;
  return `${choice.author} · ${price}`;
}

export function modelOptionsOf(
  choices: readonly PhotoAiModelChoice[],
  current: string,
  cost: (micros: number) => string,
): readonly ModelOption[] {
  const listed = choices.map((choice) => ({
    value: choice.id,
    label: choice.name,
    description: choiceDetailOf(choice, cost),
  }));
  if (choices.some((choice) => choice.id === current)) return listed;
  return [
    { value: current, label: current, description: 'In use, no longer offered with no data kept' },
    ...listed,
  ];
}

export function photosLine(total: number): string {
  return total === 1 ? '1 photo' : `${count(total)} photos`;
}

export interface SmartLink {
  readonly headline: string;
  readonly detail: string;
  readonly progress: number;
}

const PHASE_DETAIL: Readonly<Record<SmartPhase, string>> = {
  off: 'Turn on face grouping or smart search',
  'no-key': 'Waiting for an OpenRouter key',
  running: 'Analysing on your home hub',
  failed: 'Some photos could not be analysed',
  done: 'Up to date',
};

export function smartLinkOf(status: PhotoAiStatus): SmartLink {
  const phase = smartPhaseOf(status);
  const rings = stageRingsOf(status);
  const done = rings.reduce((sum, ring) => sum + ring.done, 0);
  const total = rings.reduce((sum, ring) => sum + ring.total, 0);
  if (phase === 'off') return { headline: 'Off', detail: PHASE_DETAIL.off, progress: 0 };
  return {
    headline: total === 0 ? 'Nothing to analyse yet' : `${donePercent(done, total)} analysed`,
    detail: PHASE_DETAIL[phase],
    progress: total === 0 ? 1 : done / total,
  };
}
