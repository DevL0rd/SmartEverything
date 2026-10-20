import { describe, expect, it } from 'vitest';
import {
  OFFLINE_PUBLISH_REASON,
  bottomBarItems,
  editorLayoutOf,
  inspectorTarget,
  problemText,
  selectedText,
  sheetInset,
  topBarModel,
} from './screen-model';

const NONE = { errors: 0, warnings: 0, hints: 0 } as const;

describe('editor layout per size class', () => {
  it('maps width classes to phone, tablet and wide', () => {
    expect(editorLayoutOf('compact')).toBe('phone');
    expect(editorLayoutOf('medium')).toBe('tablet');
    expect(editorLayoutOf('expanded')).toBe('tablet');
    expect(editorLayoutOf('large')).toBe('wide');
    expect(editorLayoutOf('xlarge')).toBe('wide');
  });
});

describe('top bar model', () => {
  it('disables Publish offline and names the reason', () => {
    const offline = topBarModel({ layout: 'phone', online: false, reusable: false, counts: NONE });
    expect(offline.publishDisabled).toBe(true);
    expect(offline.publishName).toBe(OFFLINE_PUBLISH_REASON);
    const online = topBarModel({ layout: 'phone', online: true, reusable: false, counts: NONE });
    expect(online.publishDisabled).toBe(false);
    expect(online.publishName).toBe('Publish');
  });

  it('reads Publish node for a Custom Node', () => {
    const model = topBarModel({ layout: 'wide', online: true, reusable: true, counts: NONE });
    expect(model.publishLabel).toBe('Publish node');
  });

  it('keeps the phone bar short and gives larger sizes Test and the sentence', () => {
    const phone = topBarModel({ layout: 'phone', online: true, reusable: false, counts: NONE });
    expect([phone.sentence, phone.testButton, phone.breadcrumb]).toEqual([false, false, false]);
    const tablet = topBarModel({ layout: 'tablet', online: true, reusable: false, counts: NONE });
    expect([tablet.sentence, tablet.testButton, tablet.breadcrumb]).toEqual([true, true, false]);
    const wide = topBarModel({ layout: 'wide', online: true, reusable: false, counts: NONE });
    expect(wide.breadcrumb).toBe(true);
  });

  it('gives only the tablet bar an Add button, since phones have the bottom bar and wide the docked palette', () => {
    const add = (layout: 'phone' | 'tablet' | 'wide'): boolean =>
      topBarModel({ layout, online: true, reusable: false, counts: NONE }).addButton;
    expect([add('phone'), add('tablet'), add('wide')]).toEqual([false, true, false]);
  });

  it('puts the most serious problem count first', () => {
    expect(problemText(NONE)).toBeNull();
    expect(problemText({ errors: 2, warnings: 5, hints: 1 })).toBe('2 to fix');
    expect(problemText({ errors: 0, warnings: 5, hints: 1 })).toBe('5 to know');
    expect(problemText({ errors: 0, warnings: 0, hints: 3 })).toBe('3 to improve');
    const model = topBarModel({
      layout: 'phone',
      online: true,
      reusable: false,
      counts: { errors: 1, warnings: 0, hints: 0 },
    });
    expect(model.problemTone).toBe('critical');
  });
});

describe('bottom bar', () => {
  const base = { reusable: false, selecting: false } as const;

  it('lists Add, Select, Test and Runs', () => {
    expect(bottomBarItems(base).map((item) => item.label)).toEqual([
      'Add',
      'Select',
      'Test',
      'Runs',
    ]);
  });

  it('offers Interface in a Custom Node and Done while selecting', () => {
    expect(bottomBarItems({ ...base, reusable: true })[3]?.id).toBe('interface');
    const selecting = bottomBarItems({ ...base, selecting: true })[1];
    expect(selecting?.label).toBe('Done');
    expect(selecting?.active).toBe(true);
  });
});

describe('inspector target and sheet inset', () => {
  it('opens the inspector for exactly one selected step and never while selecting', () => {
    expect(inspectorTarget({ ids: ['a'], selecting: false })).toBe('a');
    expect(inspectorTarget({ ids: ['a', 'b'], selecting: false })).toBeNull();
    expect(inspectorTarget({ ids: [], selecting: false })).toBeNull();
    expect(inspectorTarget({ ids: ['a'], selecting: true })).toBeNull();
  });

  it('shrinks the phone canvas to the area above an open sheet and nothing else', () => {
    expect(sheetInset('phone', true, 800)).toBe(400);
    expect(sheetInset('phone', false, 800)).toBe(0);
    expect(sheetInset('tablet', true, 800)).toBe(0);
    expect(sheetInset('wide', true, 800)).toBe(0);
  });

  it('counts the selection in words', () => {
    expect(selectedText(4)).toBe('4 selected');
  });
});
