import { describe, expect, it } from 'vitest';
import type { Href } from 'expo-router';
import type { BoardWidget, WidgetSize } from '@smarteverything/domain';
import { revealPlan, type RevealPlan } from './reveal';

function widgetOf(key: string, size: WidgetSize): BoardWidget {
  return { key, type: 'device-group', size };
}

const PAGE: Href = '/devices';

const WIDGETS = [widgetOf('medium', 'M'), widgetOf('wide', 'W'), widgetOf('huge', 'XL')];

function planFor(
  key: string,
  member: string | null,
  pageOf: () => Href | null = () => PAGE,
): RevealPlan {
  return revealPlan(WIDGETS, { key, member, pageOf });
}

describe('revealPlan', () => {
  it.each(['wide', 'huge'])('rings the %s widget and expands the member in place', (key) => {
    expect(planFor(key, 'lamp')).toStrictEqual({ kind: 'ring' });
  });

  it.each(['medium'])('opens the group page for a member on the %s widget', (key) => {
    expect(planFor(key, 'lamp')).toStrictEqual({
      kind: 'page',
      widget: WIDGETS.find((widget) => widget.key === key),
    });
  });

  it('rings a medium widget when no member is named', () => {
    expect(planFor('medium', null)).toStrictEqual({ kind: 'ring' });
  });

  it('rings a medium widget that has no page to open', () => {
    expect(planFor('medium', 'lamp', () => null)).toStrictEqual({ kind: 'ring' });
  });

  it('reports a widget that is not on the board', () => {
    expect(planFor('gone', 'lamp')).toStrictEqual({ kind: 'missing' });
  });

  it('reports every key as missing on an empty board', () => {
    expect(revealPlan([], { key: 'medium', member: null, pageOf: () => PAGE })).toStrictEqual({
      kind: 'missing',
    });
  });
});
