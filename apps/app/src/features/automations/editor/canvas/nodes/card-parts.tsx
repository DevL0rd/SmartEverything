import type { CSSProperties, ReactNode } from 'react';
import type { RunNode, SceneNode } from '../../../model/canvas/contract';
import { useRunNode } from '../run-store';

type AccentStyle = CSSProperties & Record<'--sn-accent', string>;

export function accentStyle(category: string): AccentStyle {
  return { '--sn-accent': `var(--se-cat-${category}, var(--se-primary))` };
}

export function useCardRun(id: string, scene: SceneNode): RunNode | null {
  return useRunNode(id) ?? scene.run;
}

export function CardShell({
  scene,
  run,
  selected,
  instance,
  look,
  pins,
  children,
}: {
  readonly scene: SceneNode;
  readonly run: RunNode | null;
  readonly selected: boolean;
  readonly instance?: boolean;
  readonly look?: string;
  readonly pins: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div
      className="sn-card"
      data-role={look ?? scene.role}
      data-selected={selected}
      data-state={run?.state ?? 'none'}
      data-enabled={scene.enabled}
      data-problem={scene.problems[0]?.severity ?? null}
      data-unused={scene.unused}
      data-instance={instance === true}
      style={accentStyle(scene.category)}
    >
      <div className="sn-clip" aria-hidden>
        <span className="sn-accent" />
        {children}
      </div>
      {pins}
    </div>
  );
}

export function TextBlock({
  scene,
  overline,
}: {
  readonly scene: SceneNode;
  readonly overline?: string | null;
}): ReactNode {
  const over = overline === undefined ? scene.overline : overline;
  return (
    <div className="sn-text">
      {over === null ? null : <div className="sn-overline">{over}</div>}
      <div className="sn-title">{scene.title}</div>
      {scene.subtitle === '' ? null : <div className="sn-subtitle">{scene.subtitle}</div>}
    </div>
  );
}
