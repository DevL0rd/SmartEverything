import { describe, expect, it } from 'vitest';
import {
  cycleDetent,
  detentHeight,
  dragPlan,
  openingDetent,
  snapDetent,
  stepDetent,
} from './pull-up-math';

const HOST = 800;

describe('pull-up detents', () => {
  it('measures each detent against the host height', () => {
    expect(detentHeight('peek', HOST)).toBe(0);
    expect(detentHeight('half', HOST)).toBe(400);
    expect(detentHeight('full', HOST)).toBe(800);
  });

  it('snaps a slow release to the nearest detent', () => {
    expect(snapDetent(90, 0, HOST)).toBe('peek');
    expect(snapDetent(250, 0, HOST)).toBe('half');
    expect(snapDetent(700, 0, HOST)).toBe('full');
  });

  it('lets a flick up or down jump to the next detent in its direction', () => {
    expect(snapDetent(420, -1200, HOST)).toBe('full');
    expect(snapDetent(390, 1200, HOST)).toBe('peek');
    expect(snapDetent(790, 1200, HOST)).toBe('half');
  });

  it('stays on the end detent when flicked further the same way', () => {
    expect(snapDetent(800, -1200, HOST)).toBe('full');
    expect(snapDetent(0, 1200, HOST)).toBe('peek');
  });

  it('cycles half to full and full back to closed', () => {
    expect(cycleDetent('half')).toBe('full');
    expect(cycleDetent('full')).toBe('peek');
  });

  it('steps one detent at a time from the keyboard', () => {
    expect(stepDetent('half', 'taller')).toBe('full');
    expect(stepDetent('full', 'shorter')).toBe('half');
    expect(stepDetent('half', 'shorter')).toBe('peek');
  });

  it('opens full on a short host and half otherwise', () => {
    expect(openingDetent(true)).toBe('full');
    expect(openingDetent(false)).toBe('half');
  });

  it('closes and rests at zero when a drag or flick settles at peek', () => {
    expect(dragPlan(snapDetent(90, 0, HOST), HOST)).toEqual({ rest: 0, closes: true });
    expect(dragPlan(snapDetent(400, 1200, HOST), HOST)).toEqual({ rest: 0, closes: true });
    expect(dragPlan('half', HOST)).toEqual({ rest: 400, closes: false });
  });
});
