import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WideCardProps, WideClass } from '../card/wide-card';
import { deviceFixture } from '../../../store/device-fixture';
import type { PowerState } from '../model/device-model';

interface RelayRead {
  readonly power: PowerState;
  readonly watts: number | null;
}

interface World {
  read: RelayRead;
  card: WideCardProps | null;
}

const world = vi.hoisted((): World => ({ read: { power: 'on', watts: null }, card: null }));

function stub(kind: string): (props: { readonly children?: ReactNode }) => ReactNode {
  const named = (props: { readonly children?: ReactNode }): ReactNode =>
    createElement('i', { 'data-kind': kind }, props.children ?? null);
  Object.defineProperty(named, 'name', { value: kind });
  return named;
}

vi.mock('@smarteverything/domain', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withRole: (): undefined => undefined,
}));
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: stub('View'),
}));
vi.mock('../../../components/charts', () => ({ StateTimeline: stub('StateTimeline') }));
vi.mock('../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../components/menu', () => ({
  useAnchoredMenu: (): { ref: null; open: () => void; menu: null } => ({
    ref: null,
    open: (): void => undefined,
    menu: null,
  }),
}));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../design/use-visible-live', () => ({
  useVisibleLive: (): { live: boolean; onLayout: undefined } => ({
    live: true,
    onLayout: undefined,
  }),
}));
vi.mock('../../../store/selectors', () => ({
  useRoomName: (): string => 'Dining room',
  useDeviceDerived: (): RelayRead => world.read,
}));
vi.mock('../../device-visuals', () => ({ DeviceVisual: stub('DeviceVisual') }));
vi.mock('../../automations', () => ({ useScheduleItems: (): readonly never[] => [] }));
vi.mock('../card/generic-card-face', () => ({ GenericCardFace: stub('GenericCardFace') }));
vi.mock('../card/live-spark', () => ({ LiveSpark: stub('LiveSpark') }));
vi.mock('../card/wide-card', () => ({
  WIDE_VISUAL_PX: { m: 96, w: 96, l: 128, xl: 128 },
  isWideClass: (cls: string): boolean => ['m', 'w', 'l', 'xl'].includes(cls),
  WideFigure: stub('WideFigure'),
  WideCard: (props: WideCardProps): ReactNode => {
    world.card = props;
    return null;
  },
}));
vi.mock('../controls/power-toggle', () => ({ PowerToggle: stub('PowerToggle') }));
vi.mock('../log/log-ticker', () => ({ LogTicker: stub('LogTicker') }));
vi.mock('../model/device-model', () => ({
  deviceModelOf: (): { presentation: object; power: null } => ({ presentation: {}, power: null }),
  powerStateOf: (): PowerState => world.read.power,
  valueOf: (): number | null => world.read.watts,
}));
vi.mock('./use-power-timeline', () => ({
  usePowerTimeline: (): { segments: readonly never[]; from: number; to: number } => ({
    segments: [],
    from: 0,
    to: 1,
  }),
}));

const { RelayCard } = await import('./relay-card');

function renderedCard(): WideCardProps {
  const card = world.card;
  if (card === null) {
    throw new Error('WideCard was not rendered');
  }
  return card;
}

function render(read: RelayRead, cls: WideClass): WideCardProps {
  world.read = read;
  world.card = null;
  renderToStaticMarkup(
    createElement(RelayCard, {
      device: deviceFixture(0),
      cls,
      size: cls === 'xl' ? 'XL' : 'M',
      frame: { width: 360, height: 140, idiom: 'touch' },
    }),
  );
  return renderedCard();
}

function kindsOf(nodes: readonly ReactNode[] | undefined): readonly string[] {
  return (nodes ?? []).map((node) =>
    isValidElement(node) && typeof node.type === 'function' ? node.type.name : 'other',
  );
}

function linesOf(node: ReactNode): unknown {
  return isValidElement<{ readonly lines?: number }>(node) ? node.props.lines : undefined;
}

describe('the Relay card keeps one composition at every tier', () => {
  it.each(['m', 'w', 'l', 'xl'] as const)('puts power then timer in the band at %s', (cls) => {
    expect(kindsOf(render({ power: 'on', watts: 12 }, cls).actions)).toEqual([
      'PowerToggle',
      'TimerButton',
    ]);
  });

  it('keeps the latest event on its own line, two lines in the panel', () => {
    expect(linesOf(render({ power: 'on', watts: null }, 'm').ticker)).toBe(1);
    expect(linesOf(render({ power: 'on', watts: null }, 'w').ticker)).toBe(1);
    expect(linesOf(render({ power: 'on', watts: null }, 'l').ticker)).toBe(2);
    expect(linesOf(render({ power: 'on', watts: null }, 'xl').ticker)).toBe(2);
  });

  it('shows the draw figure only while on', () => {
    expect(render({ power: 'on', watts: 12 }, 'm').figures).toHaveLength(1);
    expect(render({ power: 'off', watts: 12 }, 'm').figures).toHaveLength(0);
  });

  it('names the room on the state line', () => {
    const state = renderToStaticMarkup(
      createElement('b', null, render({ power: 'off', watts: null }, 'm').state),
    );
    expect(state).toContain('Off · Dining room');
  });
});
