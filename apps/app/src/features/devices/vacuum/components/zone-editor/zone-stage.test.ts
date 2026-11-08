import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';
import type { StageContent } from '../../../../home-map';
import { robotZoneView } from './zone-frame';
import { initialZoneState } from './zone-reducer';

type Props = Readonly<Record<string, unknown>>;

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());

const staged = vi.hoisted(() => ({ content: new Array<StageContent>() }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return null;
  };
}

vi.mock('../../../../home-map', () => ({
  Stage: (props: Props & { readonly content: StageContent }): ReactNode => {
    staged.content.push(props.content);
    return stub('Stage')(props);
  },
  HomeMap3d: stub('HomeMap3d'),
  useHomeMapLive: (): object => ({}),
}));
vi.mock('../../../../home-map/editor/stage-notice', () => ({
  StageNoticeChip: stub('StageNoticeChip'),
}));
vi.mock('../map-3d-view', () => ({ Map3dView: stub('Map3dView') }));
vi.mock('../map-view-parts', () => ({ VacuumStill: stub('VacuumStill') }));
vi.mock('../../../../../store/store-context', () => ({ useStoreSelector: (): object => ({}) }));

const { ZoneStage } = await import('./zone-stage');

const scene: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(new URL('../../model/scene-geometry.fixture.json', import.meta.url), 'utf8'),
  ),
);

const { bounds } = scene;

const CONTEXT = {
  variant: 'page',
  view3d: { preset: 'top', fitSeq: 0, follow: false },
  chrome: [],
  chromeInsets: { top: 0, bottom: 0 },
  focus: { kind: 'none' },
} as const;

function stageOf(): Props {
  seen.length = 0;
  staged.content.length = 0;
  renderToStaticMarkup(
    createElement(ZoneStage, {
      deviceId: 'robot-1',
      scene,
      view: robotZoneView(bounds),
      state: initialZoneState([], 'v1'),
      dispatch: vi.fn(),
      unified: null,
    }),
  );
  const found = seen.find((entry) => entry.kind === 'Stage');
  if (found === undefined) throw new Error('no stage');
  return found.props;
}

beforeEach(() => {
  seen.length = 0;
});

describe('the zone stage', () => {
  it('opens in Top with the 3D tools', () => {
    const stage = stageOf();
    expect(stage['camera']).toMatchObject({ preset: 'top' });
    expect(stage['tools']).toEqual({ tools3d: true });
  });

  it('edits a robot-only map on the vacuum 3D view with an empty robot floor', () => {
    stageOf();
    const [content] = staged.content;
    if (content?.kind !== 'direct') throw new Error('not a direct stage');
    seen.length = 0;
    renderToStaticMarkup(createElement(() => content.render(CONTEXT)));
    const view = seen.find((entry) => entry.kind === 'Map3dView');
    expect(view?.props['preset']).toBe('top');
    expect(view?.props['edit']).toMatchObject({
      floor: {
        wire: { floor: { id: 'vacuum', rooms: [], walls: [] }, boxes: {} },
        committed: null,
      },
      overlay: { mode: 'none', frame: { key: 'zones:robot-1', bounds, top: true } },
    });
  });
});
