import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MentionRule } from './mention-runs';

interface Props {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly accessibilityRole?: string;
}

function Box({ className, accessibilityRole, children }: Props): ReactNode {
  return createElement('div', { className, role: accessibilityRole }, children);
}

const platform = vi.hoisted(() => ({ OS: 'android' }));

vi.mock('react-native', () => ({
  View: Box,
  Text: Box,
  ScrollView: ({ children, horizontal }: Props & { readonly horizontal: boolean }): ReactNode =>
    createElement('div', { 'data-horizontal': horizontal }, children),
  Platform: {
    get OS(): string {
      return platform.OS;
    },
    constants: {},
    select: (choices: { readonly default?: unknown }): unknown => choices.default,
  },
  Linking: { openURL: (): Promise<void> => Promise.resolve() },
}));
vi.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Native: (): { readonly disallowInterruption: (value: boolean) => boolean } => ({
      disallowInterruption: (value) => value,
    }),
  },
  GestureDetector: ({ children, gesture }: Props & { readonly gesture: boolean }): ReactNode =>
    createElement('section', { 'data-native-scroll-priority': gesture }, children),
}));
vi.mock('react-native-svg', () => ({
  default: Box,
  Defs: Box,
  LinearGradient: Box,
  Rect: Box,
  Stop: Box,
}));
vi.mock('./card-action', () => ({
  CardCopy: ({ what, value }: { readonly what: string; readonly value: string }): ReactNode =>
    createElement('button', { value }, `Copy ${what}`),
}));
vi.mock('./fade-span', () => ({ FadeSpan: Box }));
vi.mock('../../../../perf/probe-kit', () => ({
  PerfProbe: ({ children }: Props): ReactNode => children,
  timed: <T>(_id: string, work: () => T): T => work(),
}));
vi.mock('../../../../design/colour', () => ({ useColour: (): string => '#000000' }));
vi.mock('./code-card', () => ({ CodeCard: Box }));

const { Markdown } = await import('./markdown');
const { mentionRuleOf } = await import('./mention-runs');
const { CHAT_SURFACE } = await import('../chat-surface');

const OWNER = [
  'Do two checks and report PASS or FAIL for each with the evidence.',
  '1. Start one helper agent with the task "Read README.md in the project folder and reply with its first heading". Wait for its result and report it.',
  '2. Set a goal for this chat: "Write the numbers 1 to 3, one per reply". Work on it until done, then clear the goal. Report how many rounds it took.',
].join('\n');

const LONG = [
  'Intro line.',
  ...Array.from(
    { length: 40 },
    (_, index) => `${String(index + 1)}. ${'kitchen lamp schedule '.repeat(index + 3)}`,
  ),
  '',
  `- ${'evening sensor '.repeat(120)}`,
].join('\n');

const TABLE = [
  '| Task | Surface | Result |',
  '| --- | --- | --- |',
  '| 1 | Home read | All rooms and capabilities are available |',
  '| 2 | Web fetch | [Read the report](https://example.org/report) |',
  '| 3 | Shell | Output included the complete command result |',
].join('\n');

function count(markup: string, pattern: RegExp): number {
  return markup.match(pattern)?.length ?? 0;
}

describe('markdown list rows inside a content sized chat bubble', () => {
  it.each([
    ['five line numbered list', OWNER, 2],
    ['very long message', LONG, 41],
  ])('%s sizes every list text column from its content', (_, text, items) => {
    const markup = renderToStaticMarkup(createElement(Markdown, { text }));
    expect(count(markup, /class="flex-row"/g)).toBe(items);
    expect(count(markup, /class="min-w-0 shrink"/g)).toBe(items);
    expect(count(markup, /\bflex-1\b|\bbasis-/g)).toBe(0);
  });
});

describe('wide Markdown tables', () => {
  it.each([
    ['android', true],
    ['web', false],
    ['ios', false],
  ] as const)(
    'keeps all cells and copy available in the horizontal viewport on %s',
    (os, native) => {
      platform.OS = os;
      const markup = renderToStaticMarkup(createElement(Markdown, { text: TABLE }));
      expect(markup).toContain('data-horizontal="true"');
      expect(markup.includes('data-native-scroll-priority')).toBe(native);
      if (native) {
        expect(markup).toContain(
          '<section data-native-scroll-priority="true"><div data-horizontal="true">',
        );
      }
      expect(markup).toContain('role="link"');
      expect(markup).toContain('Read the report');
      expect(markup).toContain('Output included the complete command result');
      expect(markup).toContain('Task\tSurface\tResult');
      expect(markup).toContain('>Copy table</button>');
    },
  );
});

const MENTIONS = mentionRuleOf([
  { kind: 'mention', text: '@Nova', participantId: 'helper:n', ink: 'viz-3', self: false },
  { kind: 'text', text: ' and ' },
  { kind: 'mention', text: '@Ana', participantId: 'me', ink: 'viz-1', self: true },
]);

function render(text: string, mentions: MentionRule | null = null): string {
  return renderToStaticMarkup(createElement(Markdown, { text, mentions }));
}

describe('mentions inside markdown text', () => {
  it('renders a chip in paragraphs, list items, quotes and headings', () => {
    const markup = render('@Nova look\n\n- ask @Nova\n\n> @Nova said\n\n## For @Nova', MENTIONS);
    expect(count(markup, /class="[^"]*bg-viz-3\/13[^"]*">@Nova</g)).toBe(4);
    expect(count(markup, /text-viz-3/g)).toBe(4);
  });

  it('styles a mention of the viewer as the self mention', () => {
    const markup = render('thanks @Ana', MENTIONS);
    expect(markup).toMatch(/class="[^"]*bg-primary\/22[^"]*font-sans-semibold[^"]*">@Ana</);
  });

  it('keeps unknown names, partial names and code plain', () => {
    const markup = render('@Ghost @Novak `@Nova` mail@Nova', MENTIONS);
    expect(markup).not.toMatch(/bg-viz-3\/13/);
    expect(markup).toContain('@Ghost @Novak');
  });

  it('keeps the text plain without mention tokens', () => {
    expect(render('@Nova look')).not.toMatch(/bg-viz-3\/13/);
  });
});

describe('markdown rhythm', () => {
  it('spaces blocks 8 px apart and items 4 px apart', () => {
    const markup = render('One.\n\nTwo.\n\n- a\n- b');
    expect(markup).toMatch(/^<div class="gap-2">/);
    expect(markup).toContain('<div class="gap-1">');
  });

  it('draws bullets as 4 px dots in a 14 px column', () => {
    const markup = render('- first\n- second');
    expect(
      count(
        markup,
        /class="w-3\.5 pl-0\.5 pt-2\.25"><div class="size-1 rounded-full bg-on-surface-variant\/70">/g,
      ),
    ).toBe(2);
  });

  it('numbers ordered lists with faint tabular numbers', () => {
    const markup = render('1. first\n2. second');
    expect(markup).toMatch(/class="[^"]*text-on-surface-faint[^"]*tabular[^"]*">1</);
    expect(markup).toMatch(/tabular[^"]*">2</);
    expect(markup).not.toContain('1.');
  });

  it('puts 12 px above a heading except at the top of the message', () => {
    expect(render('Intro.\n\n## Plan')).toContain('<div class="pt-1">');
    expect(render('## Plan\n\nBody.')).not.toContain('pt-1');
    expect(
      renderToStaticMarkup(createElement(Markdown, { text: '## Plan', lead: false })),
    ).toContain('<div class="pt-1">');
  });

  it('lets unbroken words and links break anywhere', () => {
    const markup = render(`word ${'a'.repeat(200)} https://example.org/${'b'.repeat(200)}`);
    expect(markup).toMatch(/class="[^"]*web:wrap-anywhere/);
  });
});

describe('table card surface', () => {
  it('sits on the shared chat surface with faint headers and tabular numbers', () => {
    const markup = render('| Bulb | Kelvin |\n| --- | --- |\n| Hue | 2100 |\n| Innr | 2200 |');
    expect(markup).toContain(CHAT_SURFACE);
    expect(markup).not.toContain('bg-surface-2');
    expect(markup).toMatch(/text-caption[^"]*text-on-surface-faint[^"]*">Bulb/);
    expect(markup).toMatch(/tabular[^"]*">2100/);
  });
});
