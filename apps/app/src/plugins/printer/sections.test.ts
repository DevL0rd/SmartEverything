import { PRINTER_SECTIONS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { printerAppPlugin } from '.';

const BUILT_IN_KEYS = ['overview', 'controls', 'history', 'activity', 'remote'];

describe('printer device sections', () => {
  it('are exactly the sections the hub search can point at', () => {
    expect(printerAppPlugin.deviceSections.map((section) => section.key)).toEqual([
      ...PRINTER_SECTIONS,
    ]);
  });

  it('never reuse a key of a built-in device section', () => {
    for (const section of printerAppPlugin.deviceSections) {
      expect(BUILT_IN_KEYS).not.toContain(section.key);
    }
  });

  it('are ordered as the tabs are listed and have distinct titles', () => {
    const orders = printerAppPlugin.deviceSections.map((section) => section.order ?? 0);
    expect(orders).toEqual([...orders].sort((left, right) => left - right));
    const titles = printerAppPlugin.deviceSections.map((section) => section.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
