import {
  createContext,
  use,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type {
  GraphSceneNode,
  PinGroup,
  SceneExecRow,
  ScenePin,
} from '../../../model/graph/scene-contract';
import { hiddenOutputs } from '../../../model/graph/scene-checks';
import { Glyph, IconWell } from './icons';
import type { GraphNodeRun } from '../graph-context';
import { ExecIn, ExecOut, ExecRow } from '../pins/exec-pin';
import { ValueInRow, ValueOutRow } from '../pins/value-pin';
import { PluginCardBadge } from './plugin-badge';

type AccentStyle = CSSProperties & Record<'--gc-accent', string>;

const PAIR_COLOURS = 5;

const RUN_GLYPH: Readonly<Record<string, string>> = {
  done: 'check',
  failed: 'x',
  waiting: 'clock',
};

export function cardStyle(scene: GraphSceneNode): AccentStyle {
  return {
    '--gc-accent': `var(--se-cat-${scene.category}, var(--se-primary))`,
    width: scene.w,
  };
}

const FoldContext = createContext(false);

export function moreOutputsText(hidden: number, open: boolean): string {
  if (open) return 'Fewer outputs';
  return hidden === 1 ? '+1 more output' : `+${String(hidden)} more outputs`;
}

function MoreOutputs({
  hidden,
  open,
  onToggle,
}: {
  readonly hidden: number;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  if (hidden === 0) return null;
  return (
    <button
      type="button"
      className="gc-row gc-value-row gc-add gc-more nodrag nopan"
      aria-expanded={open}
      onClick={(event: MouseEvent): void => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {moreOutputsText(hidden, open)}
    </button>
  );
}

export function pinsOf(pins: readonly ScenePin[], group: PinGroup): readonly ScenePin[] {
  return pins.filter((pin) => pin.group === group);
}

function RunMark({ run }: { readonly run: GraphNodeRun }): ReactNode {
  const state = run.node?.state;
  const glyph = state === undefined ? undefined : RUN_GLYPH[state];
  return glyph === undefined ? null : <Glyph name={glyph} className="gc-mark" />;
}

function RunText({ run }: { readonly run: GraphNodeRun }): ReactNode {
  const text = run.node?.text ?? run.node?.wakeAt;
  return text === undefined ? null : <div className="gc-run-text">{text}</div>;
}

export function CardShell({
  scene,
  run,
  selected,
  children,
}: {
  readonly scene: GraphSceneNode;
  readonly run: GraphNodeRun;
  readonly selected: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const hidden = hiddenOutputs(scene);
  return (
    <div
      className="gc-card"
      data-family={scene.family}
      data-selected={selected}
      data-state={run.node?.state ?? 'none'}
      data-enabled={scene.enabled}
      data-problem={scene.problems.length > 0}
      data-pair={scene.pairIndex === null ? undefined : scene.pairIndex % PAIR_COLOURS}
      style={cardStyle(scene)}
    >
      <span className="gc-accent" />
      <PluginCardBadge kindId={scene.kind} />
      {scene.execIn === null ? null : <ExecIn handle={scene.execIn} merged={scene.mergeCount} />}
      <FoldContext value={hidden > 0 && !open}>{children}</FoldContext>
      <MoreOutputs
        hidden={hidden}
        open={open}
        onToggle={(): void => {
          setOpen(!open);
        }}
      />
    </div>
  );
}

export function PairGlyph({ index }: { readonly index: number }): ReactNode {
  return (
    <span className="gc-pair" aria-hidden>
      {String.fromCharCode(65 + (index % 26))}
    </span>
  );
}

export function CardHeader({
  scene,
  run,
  lead,
  then,
}: {
  readonly scene: GraphSceneNode;
  readonly run: GraphNodeRun;
  readonly lead?: ReactNode;
  readonly then?: SceneExecRow;
}): ReactNode {
  return (
    <div className="gc-head">
      {lead ?? <IconWell icon={scene.icon} title={scene.title} />}
      <div className="gc-text">
        <div className="gc-title">{scene.title}</div>
        {scene.summary === '' ? null : <div className="gc-summary">{scene.summary}</div>}
        <RunText run={run} />
      </div>
      <RunMark run={run} />
      {then === undefined ? null : <HeaderThen row={then} />}
    </div>
  );
}

function HeaderThen({ row }: { readonly row: SceneExecRow }): ReactNode {
  return (
    <>
      <span className="gc-then">{row.label}</span>
      <ExecOut handle={row.handle} role={row.role} wired={row.wired} />
    </>
  );
}

export function ExecRows({
  rows,
  captionOf,
}: {
  readonly rows: readonly SceneExecRow[];
  readonly captionOf: (row: SceneExecRow) => string;
}): ReactNode {
  return rows.map((row) => <ExecRow key={row.handle} row={row} caption={captionOf(row)} />);
}

export function useShownPins(pins: readonly ScenePin[]): readonly ScenePin[] {
  const fold = use(FoldContext);
  return fold ? pins.filter((pin) => pin.wired) : pins;
}

export function OutputGroup({
  pins,
  heading,
}: {
  readonly pins: readonly ScenePin[];
  readonly heading: string | null;
}): ReactNode {
  const shown = useShownPins(pins);
  if (shown.length === 0) return null;
  return (
    <>
      {heading === null ? null : <div className="gc-group">{heading}</div>}
      {shown.map((pin) => (
        <ValueOutRow key={pin.handle} pin={pin} />
      ))}
    </>
  );
}

export function InputRows({ pins }: { readonly pins: readonly ScenePin[] }): ReactNode {
  return pinsOf(pins, 'input').map((pin) => <ValueInRow key={pin.handle} pin={pin} />);
}
