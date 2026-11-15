import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const idiom = vi.hoisted(() => ({ value: 'pointer' }));

interface BoxProps {
  readonly className?: string;
  readonly children?: ReactNode;
  readonly label?: string;
  readonly selected?: boolean;
}

vi.mock('react-native', () => ({
  View: ({ className, children }: BoxProps): ReactNode =>
    createElement('div', { className }, children),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: BoxProps): ReactNode => createElement('p', null, children),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): ReactNode => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: ({ children, label, selected }: BoxProps): ReactNode =>
    createElement(
      'button',
      { 'aria-label': label, 'data-hot': selected === true ? 'yes' : 'no' },
      children,
    ),
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): string => idiom.value }));
vi.mock('../people/face-avatar', () => ({
  FaceAvatar: ({ itemId }: { readonly itemId: string }): ReactNode =>
    createElement('i', { 'data-face': itemId }),
}));

const { Suggestions } = await import('./suggestions');

const GROUPS = [
  {
    id: 'places' as const,
    title: 'Places',
    items: [
      { token: { kind: 'place' as const, placeId: 1, label: 'Sintra, Portugal' }, count: 204 },
      { token: { kind: 'place' as const, placeId: 2, label: 'Sines, Portugal' }, count: 31 },
    ],
  },
  {
    id: 'albums' as const,
    title: 'Albums',
    items: [
      {
        token: {
          kind: 'album' as const,
          albumId: '0b9e1d1a-8f6e-4a43-9a1c-0e4a3c1f2b11',
          label: 'Sintra hike',
        },
        count: 63,
      },
    ],
  },
];

function render(highlight: number): string {
  return renderToStaticMarkup(
    createElement(Suggestions, {
      groups: GROUPS,
      words: 'si',
      highlight,
      onPick: () => undefined,
      onWords: () => undefined,
    }),
  );
}

describe('the suggestion pop', () => {
  it('lists each group with counts, then the typed words, and marks the highlighted row', () => {
    const html = render(2);
    expect(html).toContain('Places');
    expect(html).toContain('aria-label="Sintra, Portugal, 204"');
    expect(html).toContain('aria-label="Sintra hike, 63" data-hot="yes"');
    expect(html).toContain('Search for “si”');
  });

  it('highlights the words row after the last suggestion', () => {
    expect(render(3)).toContain('aria-label="Search for “si”" data-hot="yes"');
  });

  it('leads a person with their face and shows the text snippet under a text hit', () => {
    const html = renderToStaticMarkup(
      createElement(Suggestions, {
        groups: [
          {
            id: 'people',
            title: 'People',
            items: [
              {
                token: {
                  kind: 'person',
                  groupId: '6b9e1d1a-8f6e-4a43-9a1c-0e4a3c1f2b11',
                  label: 'Anna',
                },
                count: 12,
                face: { itemId: 'cover-1', box: null, kind: 'person' },
              },
            ],
          },
          {
            id: 'text',
            title: 'Text in photos',
            items: [
              {
                token: { kind: 'photoText', text: 'menu', label: 'Text “menu”' },
                count: null,
                detail: 'Lunch menu of the day',
              },
            ],
          },
        ],
        words: 'an',
        highlight: 0,
        onPick: () => undefined,
        onWords: () => undefined,
      }),
    );
    expect(html).toContain('data-face="cover-1"');
    expect(html).toContain('aria-label="Anna, 12"');
    expect(html).toContain('Lunch menu of the day');
    expect(html).toContain('Text in photos');
  });

  it('shows the Enter and Backspace hints only with a pointer', () => {
    expect(render(0)).toContain('Backspace');
    idiom.value = 'touch';
    expect(render(0)).not.toContain('Backspace');
  });
});
