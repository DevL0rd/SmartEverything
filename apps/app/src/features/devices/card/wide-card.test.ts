import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FrameClass } from '../../../components/widget-board';
import type { WideCardProps, WideClass } from './wide-card';

interface ViewProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: Readonly<Record<string, number>>;
  readonly accessibilityLabel?: string;
  readonly 'aria-hidden'?: boolean;
}

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    View: ({ children, className, style, accessibilityLabel, ...rest }: ViewProps): ReactNode =>
      createElement(
        'div',
        {
          className,
          style,
          'aria-label': accessibilityLabel,
          'aria-hidden': rest['aria-hidden'],
        },
        children,
      ),
  };
});

const { WIDE_VISUAL_PX, WideCard, isWideClass } = await import('./wide-card');

interface MarkupNode {
  readonly tag: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly MarkupNode[];
  readonly parent: MarkupNode | null;
}

interface Draft {
  readonly tag: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: Draft[];
  readonly parent: Draft | null;
}

const TAG = /<(\/?)([a-z][a-z0-9]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
const ATTRIBUTE = /([^\s=]+)(?:="([^"]*)")?/g;

function attributesOf(source: string): ReadonlyMap<string, string> {
  return new Map([...source.matchAll(ATTRIBUTE)].map((match) => [match[1] ?? '', match[2] ?? '']));
}

function treeOf(markup: string): MarkupNode {
  const root: Draft = { tag: 'root', attributes: new Map(), children: [], parent: null };
  let open = root;
  for (const [, closing, tag = '', attributes = '', selfClosing] of markup.matchAll(TAG)) {
    if (closing === '/') {
      open = open.parent ?? root;
      continue;
    }
    const node: Draft = { tag, attributes: attributesOf(attributes), children: [], parent: open };
    open.children.push(node);
    if (selfClosing !== '/') open = node;
  }
  return root;
}

function find(node: MarkupNode, test: (candidate: MarkupNode) => boolean): MarkupNode | null {
  if (test(node)) return node;
  for (const child of node.children) {
    const found = find(child, test);
    if (found !== null) return found;
  }
  return null;
}

function slot(root: MarkupNode, name: string): MarkupNode {
  const found = find(root, (node) => node.attributes.get('data-slot') === name);
  if (found === null) throw new Error(`Expected the ${name} slot`);
  return found;
}

function parentOf(node: MarkupNode): MarkupNode {
  if (node.parent === null) throw new Error(`Expected a parent of ${node.tag}`);
  return node.parent;
}

function classOf(node: MarkupNode): string {
  return node.attributes.get('class') ?? '';
}

const mark = (name: string): ReactNode => createElement('i', { key: name, 'data-slot': name });

function html(cls: WideClass, props: Partial<WideCardProps> = {}): string {
  return renderToStaticMarkup(
    createElement(WideCard, {
      cls,
      summary: 'Router, online',
      visual: mark('visual'),
      title: 'Router',
      ...props,
    }),
  );
}

function slots(markup: string, name: string): number {
  return markup.split(`data-slot="${name}"`).length - 1;
}

function art(root: MarkupNode): MarkupNode {
  return parentOf(slot(root, 'visual'));
}

function lane(root: MarkupNode): MarkupNode {
  const card = parentOf(art(root));
  const found = card.children[1];
  if (found === undefined) throw new Error('Expected the content lane');
  return found;
}

const CLASSES = ['m', 'w', 'l', 'xl'] as const;

const FULL: Partial<WideCardProps> = {
  actions: [mark('action-0'), mark('action-1')],
  graph: mark('graph'),
  log: mark('log'),
  ticker: mark('ticker'),
  figures: [mark('figure-0')],
};

describe('the wide card scaffold', () => {
  it('is for the four wide frame classes only', () => {
    const classes: readonly FrameClass[] = ['xs', 's', 'm', 'w', 'l', 'xl'];
    expect(classes.map(isWideClass)).toEqual([false, false, true, true, true, true]);
  });

  it('names the card once for screen readers', () => {
    expect(html('m')).toContain('aria-label="Router, online"');
  });

  it.each(CLASSES)('draws the visual once at %s', (cls) => {
    expect(slots(html(cls), 'visual')).toBe(1);
  });

  it('shows every figure and lets them wrap', () => {
    const figures = Array.from({ length: 5 }, (_, index) => mark(`figure-${String(index)}`));
    const markup = html('m', { figures });
    const shown = figures.reduce<number>(
      (sum, _, index) => sum + slots(markup, `figure-${String(index)}`),
      0,
    );
    expect(shown).toBe(5);
    expect(classOf(parentOf(slot(treeOf(markup), 'figure-0')))).toContain('flex-wrap');
  });

  it('collapses empty slots instead of leaving a gap', () => {
    const bare = html('m');
    expect(bare).not.toContain('data-slot="graph"');
    expect(bare).not.toContain('data-slot="ticker"');
  });

  it('keeps the graph hidden from screen readers', () => {
    const withGraph = html('m', { graph: mark('graph') });
    expect(withGraph).toContain('aria-hidden="true"');
    expect(slots(withGraph, 'graph')).toBe(1);
  });

  it.each(CLASSES)(
    'mounts the log only once measured room holds it, the ticker always, at %s',
    (cls) => {
      const withTail = html(cls, { log: mark('log'), ticker: mark('ticker') });
      expect(slots(withTail, 'log')).toBe(0);
      expect(slots(withTail, 'ticker')).toBe(1);
    },
  );
});

describe('the wide card geometry', () => {
  it.each(CLASSES)('draws a top-aligned square art box of the tier size at %s', (cls) => {
    const box = art(treeOf(html(cls)));
    const px = String(WIDE_VISUAL_PX[cls]);
    expect(box.attributes.get('style')).toContain(`width:${px}px`);
    expect(box.attributes.get('style')).toContain(`height:${px}px`);
    expect(classOf(box)).toContain('self-start');
    expect(classOf(box)).toContain('shrink-0');
  });

  it('uses one art size for M and W and one for XL', () => {
    expect([WIDE_VISUAL_PX.m, WIDE_VISUAL_PX.w, WIDE_VISUAL_PX.l, WIDE_VISUAL_PX.xl]).toEqual([
      96, 96, 128, 128,
    ]);
  });

  it.each(CLASSES)('keeps everything else out of the art lane at %s', (cls) => {
    const root = treeOf(html(cls, FULL));
    const box = art(root);
    expect(box.children).toHaveLength(1);
    const card = parentOf(box);
    expect(card.children).toHaveLength(2);
    expect(classOf(card)).toContain('flex-row');
  });

  it.each(CLASSES)('puts every action in one right-aligned band at the lane end at %s', (cls) => {
    const actions = Array.from({ length: 9 }, (_, index) => mark(`action-${String(index)}`));
    const root = treeOf(html(cls, { ...FULL, actions }));
    const band = parentOf(slot(root, 'action-0'));
    const content = lane(root);
    expect(parentOf(band)).toBe(content);
    expect(content.children.at(-1)).toBe(band);
    expect(band.children).toHaveLength(9);
    for (const name of ['mt-1.5', 'justify-end', 'flex-wrap', 'flex-row']) {
      expect(classOf(band)).toContain(name);
    }
    expect(content.children.some((child) => classOf(child).split(' ').includes('flex-1'))).toBe(
      true,
    );
  });

  it('pushes the band down with a lead when nothing above it fills the lane', () => {
    const root = treeOf(html('m', { actions: [mark('action-0')] }));
    const band = parentOf(slot(root, 'action-0'));
    const content = lane(root);
    expect(classOf(band)).toContain('mt-auto');
    expect(classOf(content.children.at(-2) ?? band)).toBe('h-1.5');
    expect(content.children.at(-1)).toBe(band);
  });

  it('keeps the lead below the content when there are no actions', () => {
    const content = lane(treeOf(html('m', { graph: mark('graph') })));
    expect(classOf(content.children.at(-1) ?? content)).toBe('h-1.5');
  });

  it('places the graph beside the info in the wide class and below it elsewhere', () => {
    const wide = treeOf(html('w', { graph: mark('graph') }));
    expect(classOf(parentOf(parentOf(parentOf(slot(wide, 'graph')))))).toContain('flex-row');
    const medium = treeOf(html('m', { graph: mark('graph') }));
    const holder = parentOf(parentOf(slot(medium, 'graph')));
    expect(parentOf(holder)).toBe(lane(medium));
    expect(classOf(holder)).toContain('flex-1');
  });
});
