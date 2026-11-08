import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_IR_REMOTE_STATE } from '@smarteverything/domain';
import type { WideCardProps, WideClass } from '../card/wide-card';
import { deviceFixture } from '../../../store/device-fixture';
import type { RemoteSource } from './remote-source';
import type { RemoteView } from './use-remote-view';

interface World {
  view: RemoteView | null;
  card: WideCardProps | null;
  heights: number[];
}

const world = vi.hoisted((): World => ({ view: null, card: null, heights: [] }));

function stub(kind: string): (props: { readonly children?: ReactNode }) => ReactNode {
  const named = (props: { readonly children?: ReactNode }): ReactNode =>
    createElement('i', { 'data-kind': kind }, props.children ?? null);
  Object.defineProperty(named, 'name', { value: kind });
  return named;
}

function ReasonLine({ text }: { readonly text: string }): ReactNode {
  return createElement('i', { 'data-kind': 'ReasonLine' }, text);
}

function RemoteGraph({ height }: { readonly height: number }): ReactNode {
  world.heights.push(height);
  return null;
}

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: stub('View'),
}));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { settings: { device: (): string => '/settings' } },
}));
vi.mock('../../../components/badge', () => ({ Badge: stub('Badge') }));
vi.mock('../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../components/reason-line', () => ({ ReasonLine }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../card/wide-card', () => ({
  WIDE_VISUAL_PX: { m: 96, w: 96, l: 128, xl: 128 },
  WideCard: (props: WideCardProps): ReactNode => {
    world.card = props;
    return null;
  },
}));
vi.mock('./remote-actions', () => ({
  actionsOf: (): readonly ReactNode[] => [createElement(stub('PowerKey'), { key: 'power' })],
}));
vi.mock('./remote-graph', () => ({ RemoteGraph }));
vi.mock('./remote-visual', () => ({ RemoteVisual: stub('RemoteVisual') }));
vi.mock('./use-remote-view', () => ({
  useRemoteView: (): RemoteView | null => world.view,
}));

const { RemoteFace } = await import('./remote-face');

const BLASTER = deviceFixture(1);

const SOURCE: RemoteSource = {
  id: 'remote-1',
  name: 'Living room air conditioner remote',
  category: 'tv',
  keys: ['power'],
  host: deviceFixture(0),
  blaster: BLASTER,
  blasterName: 'Hall blaster',
  online: true,
  send: (): Promise<boolean> => Promise.resolve(true),
};

const NEVER_SENT: RemoteView = {
  controls: { power: 'power', stepper: null, keys: [], modes: [], hasPad: false },
  assumed: EMPTY_IR_REMOTE_STATE,
  confirmation: null,
  press: (): void => undefined,
  chip: { label: 'Ready', tone: 'neutral' },
  line: { text: 'Nothing sent yet', tone: 'variant' },
  failure: null,
  on: null,
  blocked: null,
  empty: false,
  look: { on: null, assumed: true, failed: false, sentAt: null },
} as const satisfies RemoteView;

function renderedCard(): WideCardProps {
  const card = world.card;
  if (card === null) {
    throw new Error('WideCard was not rendered');
  }
  return card;
}

function render(view: RemoteView, cls: WideClass, source: RemoteSource = SOURCE): WideCardProps {
  world.view = view;
  world.card = null;
  renderToStaticMarkup(createElement(RemoteFace, { source, cls }));
  return renderedCard();
}

function kindsOf(nodes: readonly ReactNode[] | undefined): readonly string[] {
  return (nodes ?? []).map((node) =>
    isValidElement(node) && typeof node.type === 'function' ? node.type.name : 'other',
  );
}

function markupOf(node: ReactNode): string {
  return renderToStaticMarkup(createElement('b', null, node));
}

describe('the IR remote card keeps one composition at every tier', () => {
  it.each(['m', 'w', 'l', 'xl'] as const)('keeps the two-line title at %s', (cls) => {
    expect(render(NEVER_SENT, cls).titleLines).toBe(2);
  });

  it('scales the graph with the tier strip height', () => {
    world.heights = [];
    for (const cls of ['m', 'w', 'l', 'xl'] as const) {
      renderToStaticMarkup(createElement('b', null, render(NEVER_SENT, cls).graph));
    }
    expect(world.heights).toEqual([16, 28, 48, 48]);
  });

  it('puts the remote keys in the action band when never sent', () => {
    const card = render(NEVER_SENT, 'm');
    expect(kindsOf(card.actions)).toEqual(['PowerKey']);
    expect(markupOf(card.ticker)).toBe('<b></b>');
  });

  it('keeps the failure note in the content lane next to the keys', () => {
    const failed = {
      ...NEVER_SENT,
      failure: { text: 'The last key did not go through', tone: 'critical' },
    } as const satisfies RemoteView;
    const card = render(failed, 'w');
    expect(kindsOf(card.actions)).toEqual(['PowerKey']);
    expect(markupOf(card.ticker)).toContain('The last key did not go through');
  });

  it.each(['m', 'xl'] as const)('moves the blocked reason out of the band at %s', (cls) => {
    const blocked = {
      ...NEVER_SENT,
      blocked: 'Hall blaster is offline. Nothing can be sent.',
    } as const satisfies RemoteView;
    const card = render(blocked, cls);
    expect(card.actions).toEqual([]);
    expect(markupOf(card.ticker)).toContain('data-kind="ReasonLine"');
    expect(markupOf(card.ticker)).toContain('Hall blaster is offline. Nothing can be sent.');
  });

  it('offers learning a button when the remote is empty', () => {
    const card = render({ ...NEVER_SENT, empty: true }, 'm');
    expect(kindsOf(card.actions)).toEqual(['LearnButton']);
  });

  it('explains an empty remote without a blaster in the content lane', () => {
    const card = render({ ...NEVER_SENT, empty: true }, 'm', { ...SOURCE, blaster: null });
    expect(card.actions).toEqual([]);
    expect(markupOf(card.ticker)).toContain('No buttons yet.');
  });
});
