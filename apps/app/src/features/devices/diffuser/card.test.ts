import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WideCardProps, WideClass } from '../card/wide-card';
import { deviceFixture } from '../../../store/device-fixture';
import type { DiffuserRead } from './diffuser-read';

interface World {
  read: DiffuserRead | null;
  hours: number | null;
  card: WideCardProps | null;
}

const world = vi.hoisted((): World => ({ read: null, hours: null, card: null }));

function stub(kind: string): (props: { readonly children?: ReactNode }) => ReactNode {
  const named = (props: { readonly children?: ReactNode }): ReactNode =>
    createElement('i', { 'data-kind': kind }, props.children ?? null);
  Object.defineProperty(named, 'name', { value: kind });
  return named;
}

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: stub('View'),
}));
vi.mock('../../../components/badge', () => ({ Badge: stub('Badge') }));
vi.mock('../../../components/level-pill', () => ({ LevelPill: stub('LevelPill') }));
vi.mock('../../../components/reason-line', () => ({ ReasonLine: stub('ReasonLine') }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../design/use-visible-live', () => ({
  useVisibleLive: (): { live: boolean; onLayout: undefined } => ({
    live: true,
    onLayout: undefined,
  }),
}));
vi.mock('../../../store/selectors', () => ({ useRoomName: (): string => 'Hall' }));
vi.mock('../../device-visuals', () => ({ DeviceVisual: stub('DeviceVisual') }));
vi.mock('../card/generic-card-face', () => ({ GenericCardFace: stub('GenericCardFace') }));
vi.mock('../card/wide-card', () => ({
  WIDE_VISUAL_PX: { m: 96, w: 96, l: 128, xl: 128 },
  isWideClass: (cls: string): boolean => ['m', 'w', 'l', 'xl'].includes(cls),
  WideCard: (props: WideCardProps): ReactNode => {
    world.card = props;
    return null;
  },
}));
vi.mock('../controls/power-toggle', () => ({ PowerToggle: stub('PowerToggle') }));
vi.mock('../log/log-mini', () => ({ LogMini: stub('LogMini') }));
vi.mock('../log/log-ticker', () => ({ LogTicker: stub('LogTicker') }));
vi.mock('./light-sheet', () => ({ LightSheetButton: stub('LightSheetButton') }));
vi.mock('./rhythm-strip', () => ({ RhythmStrip: stub('RhythmStrip') }));
vi.mock('./spray-button', () => ({ SprayButton: stub('SprayButton') }));
vi.mock('./strength-control', () => ({ StrengthMenuButton: stub('StrengthMenuButton') }));
vi.mock('./use-diffuser', () => ({
  useDiffuserRead: (): DiffuserRead | null => world.read,
  useDiffuserSchedule: (): null => null,
  useHoursSinceRefill: (): number | null => world.hours,
}));

const { DiffuserCard } = await import('./card');

const ON: DiffuserRead = {
  power: 'on',
  fault: false,
  rhythm: { intervalMinutes: 30, durationSeconds: 10 },
  strength: 'medium',
  battery: 80,
  charging: false,
  light: true,
};

function kindsOf(nodes: readonly ReactNode[] | undefined): readonly string[] {
  return (nodes ?? []).map((node) =>
    isValidElement(node) && typeof node.type === 'function' ? node.type.name : 'other',
  );
}

function renderedCard(): WideCardProps {
  const card = world.card;
  if (card === null) {
    throw new Error('WideCard was not rendered');
  }
  return card;
}

function render(read: DiffuserRead, cls: WideClass): WideCardProps {
  world.read = read;
  world.card = null;
  renderToStaticMarkup(
    createElement(DiffuserCard, {
      device: deviceFixture(0),
      cls,
      size: cls === 'xl' ? 'XL' : 'M',
      frame: { width: 360, height: 140, idiom: 'touch' },
    }),
  );
  return renderedCard();
}

describe('the Diffuser card keeps one composition at every tier', () => {
  it.each(['m', 'w', 'l', 'xl'] as const)('offers every scenting action at %s', (cls) => {
    expect(kindsOf(render(ON, cls).actions)).toEqual([
      'SprayButton',
      'StrengthMenuButton',
      'LightSheetButton',
      'PowerToggle',
    ]);
  });

  it.each(['m', 'xl'] as const)('puts the offline reason in the content lane at %s', (cls) => {
    const card = render({ ...ON, power: 'offline' }, cls);
    expect(card.actions).toEqual([]);
    expect(renderToStaticMarkup(createElement('b', null, card.ticker))).toContain('ReasonLine');
  });

  it.each(['m', 'xl'] as const)('keeps every scenting action while off at %s', (cls) => {
    expect(kindsOf(render({ ...ON, power: 'off' }, cls).actions)).toEqual([
      'SprayButton',
      'StrengthMenuButton',
      'LightSheetButton',
      'PowerToggle',
    ]);
  });

  it('offers power when faulted', () => {
    expect(kindsOf(render({ ...ON, fault: true }, 'w').actions)).toEqual(['PowerToggle']);
  });

  it('shows the refill age in the short form at every tier', () => {
    world.hours = 12;
    for (const cls of ['m', 'xl'] as const) {
      const figures = render(ON, cls).figures ?? [];
      expect(renderToStaticMarkup(createElement('b', null, ...figures))).toContain(
        'Refilled 12 h ago',
      );
    }
    world.hours = null;
  });
});
