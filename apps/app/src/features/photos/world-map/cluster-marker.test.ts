import type { PlaceCluster } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ Pressable: stub('Pressable'), View: stub('View') }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));

const { ClusterMarker } = await import('./cluster-marker');
const { clusterMarks } = await import('./clusters');
const { fitOf, WORLD_VIEW } = await import('./projection');
const { count } = await import('../../../format/number');

const lisbon: PlaceCluster = {
  geohash: 'eyckp',
  lat: 38.72,
  lon: -9.14,
  count: 1284,
  coverItemId: 'item-lisbon',
  placeId: null,
};

function draw(selected: boolean, onSelect: (cluster: PlaceCluster) => void): void {
  seen.length = 0;
  const [mark] = clusterMarks([lisbon], fitOf(WORLD_VIEW, { width: 1000, height: 400 }));
  if (mark === undefined) throw new Error('no mark');
  renderToStaticMarkup(createElement(ClusterMarker, { mark, selected, onSelect }));
}

function isPress(value: unknown): value is () => void {
  return typeof value === 'function';
}

function only(kind: string): Props {
  const found = seen.find((entry) => entry.kind === kind)?.props;
  if (found === undefined) throw new Error(`no ${kind}`);
  return found;
}

describe('cluster marker', () => {
  it('draws a translucent data colour disc with the count and names it for screen readers', () => {
    draw(false, vi.fn());
    expect(String(only('View')['className'])).toContain('bg-viz-1/28');
    expect(only('Text')['tone']).toBe('default');
    expect(only('Text').children).toBe(count(1284));
    expect(only('Pressable')['accessibilityLabel']).toBe(`${count(1284)} photos here`);
    expect(only('Pressable')['accessibilityState']).toEqual({ selected: false });
  });

  it('fills the selected cluster and hands it to the page when pressed', () => {
    const onSelect = vi.fn();
    draw(true, onSelect);
    expect(String(only('View')['className'])).toMatch(/bg-viz-1(?!\/)/);
    expect(only('Text')['tone']).toBe('onPrimary');
    expect(only('Pressable')['accessibilityState']).toEqual({ selected: true });
    const press = only('Pressable')['onPress'];
    if (!isPress(press)) throw new Error('no press');
    press();
    expect(onSelect).toHaveBeenCalledWith(lisbon);
  });
});
