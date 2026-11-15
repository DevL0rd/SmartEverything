import { describe, expect, it } from 'vitest';
import { nodeOfEntry } from '../source/fixture-tree';
import type { FileCrumb } from '../source/types';
import { CRUMB_LEADING, collapsedCrumbsOf, crumbWidthOf, type CrumbPart } from './crumb-model';

const crumb = (label: string): FileCrumb => ({
  key: label,
  label,
  location: { place: 'home', folder: label },
});

const trail = ['Home', 'Projects', 'Clients', 'Acme', 'Invoices', '2026'].map(crumb);

function labels(parts: readonly CrumbPart[]): readonly string[] {
  return parts.map((part) =>
    part.kind === 'more' ? `…${String(part.hidden.length)}` : part.crumb.label,
  );
}

describe('crumb collapse', () => {
  it('shows every crumb when they fit', () => {
    expect(labels(collapsedCrumbsOf(trail, 1200))).toEqual([
      'Home',
      'Projects',
      'Clients',
      'Acme',
      'Invoices',
      '2026',
    ]);
  });

  it('collapses the middle crumbs at phone width and keeps the first and the current one', () => {
    expect(labels(collapsedCrumbsOf(trail, 380))).toEqual([
      'Home',
      '…2',
      'Acme',
      'Invoices',
      '2026',
    ]);
    expect(labels(collapsedCrumbsOf(trail, 200))).toEqual(['Home', '…4', '2026']);
  });

  it('marks only the last crumb as current', () => {
    const parts = collapsedCrumbsOf(trail, 200);
    expect(parts.map((part) => part.kind === 'crumb' && part.current)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('never collapses a trail of two', () => {
    expect(labels(collapsedCrumbsOf(trail.slice(0, 2), 10))).toEqual(['Home', 'Projects']);
  });

  it('hides the crumbs in their order', () => {
    const [, more] = collapsedCrumbsOf(trail, 200);
    expect(more?.kind === 'more' ? more.hidden.map((item) => item.label) : []).toEqual([
      'Projects',
      'Clients',
      'Acme',
      'Invoices',
    ]);
  });

  it('makes room for the folder glyph a crumb leads with', () => {
    const plain = crumb('Projects');
    const leading = {
      ...plain,
      leading: nodeOfEntry({
        key: 'Projects',
        parentKey: 'home',
        name: 'Projects',
        kind: 'folder',
      }),
    };
    expect(crumbWidthOf(leading)).toBe(crumbWidthOf(plain) + CRUMB_LEADING);
  });
});
