import type { NodeKind } from '@smarteverything/domain';
import { hasBehaviour } from './behaviour-model';
import { inputsModel } from './inputs-model';
import { hasLoopLimits } from './loop-model';
import type { NodeView } from './node-view';
import { REUSABLE_CALL_KIND } from './node-view';
import { failAgainChoice } from './catch-model';
import type { InspectorEnv } from './section-types';
import { STRUCTURED_KIND_IDS } from './structured-model';

export const SECTION_IDS = [
  'header',
  'problems',
  'instance',
  'inputs',
  'together',
  'target',
  'return',
  'failAgain',
  'outputs',
  'rows',
  'structured',
  'limits',
  'behaviour',
  'notes',
  'advanced',
  'run',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

const ROW_KIND_IDS: ReadonlySet<string> = new Set([
  'flow.if',
  'flow.switch',
  'flow.parallel',
  'flow.try',
]);

const LOOP_EXIT_IDS: ReadonlySet<string> = new Set(['flow.break', 'flow.continue']);

type Applies = (view: NodeView, kind: NodeKind) => boolean;

function hasInputs(view: NodeView, kind: NodeKind): boolean {
  const model = inputsModel(kind, view.node);
  return model.rows.length > 0 || model.form.length > 0;
}

function isFailAgain(view: NodeView): boolean {
  return view.entry.kind === 'node' && failAgainChoice(view.entry.node) !== null;
}

const KIND_RULES: readonly (readonly [SectionId, Applies])[] = [
  ['instance', (_view, kind): boolean => kind.id === REUSABLE_CALL_KIND],
  ['inputs', hasInputs],
  ['together', (_view, kind): boolean => kind.id === 'flow.for_each'],
  ['target', (_view, kind): boolean => LOOP_EXIT_IDS.has(kind.id)],
  ['return', (_view, kind): boolean => kind.id === 'flow.return'],
  ['failAgain', isFailAgain],
  ['outputs', (_view, kind): boolean => kind.outputs.length > 0],
  ['rows', (_view, kind): boolean => ROW_KIND_IDS.has(kind.id)],
  ['structured', (_view, kind): boolean => STRUCTURED_KIND_IDS.has(kind.id)],
  ['limits', (_view, kind): boolean => hasLoopLimits(kind)],
  ['behaviour', (_view, kind): boolean => hasBehaviour(kind)],
];

function kindSections(view: NodeView, kind: NodeKind): readonly SectionId[] {
  return KIND_RULES.filter(([, applies]) => applies(view, kind)).map(([id]) => id);
}

export function sectionsFor(view: NodeView, env: InspectorEnv): readonly SectionId[] {
  const own = view.kind === undefined ? [] : kindSections(view, view.kind);
  const found: readonly SectionId[] = [
    'header',
    ...(env.findings.length > 0 ? (['problems'] as const) : []),
    ...own,
    'notes',
    'advanced',
    ...(env.run === null ? [] : (['run'] as const)),
  ];
  return SECTION_IDS.filter((id) => found.includes(id));
}
