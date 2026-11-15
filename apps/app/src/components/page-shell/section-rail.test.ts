import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { AppHref } from '../app-href';
import { Interactive, type InteractiveProps } from '../interactive';
import { RailItem, railEntryLabel, type RailEntry } from './section-rail';

const ENTRY: RailEntry = {
  id: 'albums',
  label: 'Albums',
  icon: 'image',
  missing: null,
};

describe('section rail entry label', () => {
  it('reads the plain label when there is no count and nothing is missing', () => {
    expect(railEntryLabel(ENTRY)).toBe('Albums');
  });

  it('reads the trailing count after the label', () => {
    expect(railEntryLabel({ ...ENTRY, count: '1,204' })).toBe('Albums, 1,204');
  });

  it('keeps the missing reason last and skips an empty count', () => {
    expect(railEntryLabel({ ...ENTRY, count: '', missing: 'Not available on Linux yet' })).toBe(
      'Albums, Not available on Linux yet',
    );
    expect(railEntryLabel({ ...ENTRY, count: '24', missing: 'Offline' })).toBe(
      'Albums, 24, Offline',
    );
  });
});

function elementOf<P>(node: unknown): ReactElement<P> {
  if (!isValidElement<P>(node)) throw new Error('not an element');
  return node;
}

function linkOf(item: ReactElement<InteractiveProps>): Readonly<Record<string, unknown>> {
  return elementOf<Record<string, unknown>>(Interactive(item.props)).props;
}

describe('section rail item link', () => {
  const rail = {
    groups: [],
    active: 'recent',
    width: 'wide',
    hrefOf: (): AppHref => '/photos',
    label: 'Photos sections',
    safeTop: false,
  } as const;

  it('replaces the open section when the rail navigates by replacing', () => {
    const item = elementOf<InteractiveProps>(
      RailItem({ entry: ENTRY, rail: { ...rail, navigation: 'replace' } }),
    );
    expect(item.type).toBe(Interactive);
    const link = linkOf(item);
    expect(link['href']).toBe('/photos');
    expect(link['replace']).toBe(true);
    expect(link['push']).toBe(false);
  });

  it('keeps the plain link navigation when no mode is given', () => {
    const link = linkOf(elementOf<InteractiveProps>(RailItem({ entry: ENTRY, rail })));
    expect(link['replace']).toBe(false);
    expect(link['push']).toBe(false);
  });
});
