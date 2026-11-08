import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MASTER_WIDTH } from '../../../design/size-class';
import {
  DOCK_DEFAULT,
  DOCK_MAX,
  DOCK_MIN,
  aiLayout,
  type AiLayout,
  type AiLayoutInput,
} from './ai-layout';

const BASE: AiLayoutInput = {
  windowWidth: 1280,
  windowHeight: 800,
  idiom: 'pointer',
  nav: 'sidebar',
  sidebarCollapsed: false,
  listOpen: true,
  dockOpen: false,
  dockWidth: DOCK_DEFAULT,
};

function layoutOf(change: Partial<AiLayoutInput>): AiLayout {
  return aiLayout({ ...BASE, ...change });
}

describe('the master pane width is one value for the layout math and the stylesheet', () => {
  it('matches the master spacing token', () => {
    const css = readFileSync(new URL('../../../../global.css', import.meta.url), 'utf8');
    expect(css).toContain(`--spacing-master: ${String(MASTER_WIDTH)}px;`);
  });
});

describe('how the assistant shell lays out narrow windows', () => {
  it('stacks a 375 wide web window beside the rail with a tight composer', () => {
    const layout = layoutOf({ windowWidth: 375, windowHeight: 812, nav: 'rail' });
    expect(layout).toMatchObject({
      mode: 'stack',
      areaWidth: 295,
      listPane: false,
      readingWidth: 263,
      composerClass: 'tight',
    });
  });

  it('stacks a 375 wide phone under the tab bar with a tight composer', () => {
    const layout = layoutOf({ windowWidth: 375, windowHeight: 812, idiom: 'touch', nav: 'bar' });
    expect(layout).toMatchObject({ mode: 'stack', areaWidth: 375, composerClass: 'tight' });
  });

  it('opens the list over a 768 wide web window as an overlay', () => {
    const layout = layoutOf({ windowWidth: 768, windowHeight: 1024, nav: 'rail' });
    expect(layout).toMatchObject({ mode: 'overlay', areaWidth: 688, conversationWidth: 688 });
    expect(layout.listPane).toBe(false);
  });

  it('stacks a 768 wide tablet', () => {
    const layout = layoutOf({ windowWidth: 768, idiom: 'touch', nav: 'rail' });
    expect(layout).toMatchObject({ mode: 'stack', areaWidth: 688 });
  });

  it('overlays the list at 840 where the area is only 576 wide', () => {
    const layout = layoutOf({ windowWidth: 840 });
    expect(layout).toMatchObject({ mode: 'overlay', areaWidth: 576, conversationWidth: 576 });
    expect(layout.listPane).toBe(false);
  });
});

describe('how the assistant shell lays out desktop windows', () => {
  it('splits at the measured room for the list and the minimum detail width', () => {
    expect(layoutOf({ windowWidth: 1243 })).toMatchObject({
      mode: 'overlay',
      listPane: false,
      conversationWidth: 979,
    });
    expect(layoutOf({ windowWidth: 1244 })).toMatchObject({
      mode: 'split',
      listPane: true,
      conversationWidth: 560,
    });
    expect(layoutOf({ windowWidth: 1052, sidebarCollapsed: true })).toMatchObject({
      mode: 'split',
      listPane: true,
      conversationWidth: 560,
    });
  });

  it('keeps the detail minimum at 1024 even with the sidebar collapsed', () => {
    expect(layoutOf({ windowWidth: 1024 })).toMatchObject({ mode: 'overlay', areaWidth: 760 });
    const collapsed = layoutOf({ windowWidth: 1024, sidebarCollapsed: true });
    expect(collapsed).toMatchObject({ mode: 'overlay', areaWidth: 952, listPane: false });
    expect(collapsed.conversationWidth).toBe(952);
  });

  it('shows the list beside a 596 wide conversation at 1280', () => {
    expect(layoutOf({})).toMatchObject({
      mode: 'split',
      areaWidth: 1016,
      listPane: true,
      dock: 'none',
      conversationWidth: 596,
    });
  });

  it('hides the list while the dock is open at 1280 and restores it when the dock closes', () => {
    const open = layoutOf({ dockOpen: true });
    expect(open).toMatchObject({ listPane: false, listSuppressed: true, dock: 'docked' });
    expect(open.conversationWidth).toBeGreaterThanOrEqual(560);
    expect(open.dockWidth).toBeGreaterThanOrEqual(DOCK_MIN);
    expect(layoutOf({ dockOpen: false })).toMatchObject({ listPane: true, listSuppressed: false });
  });

  it('uses the default dock width on a 1280 landscape tablet', () => {
    const layout = layoutOf({ idiom: 'touch', dockOpen: true, dockWidth: 700 });
    expect(layout).toMatchObject({ mode: 'split', areaWidth: 1016, listSuppressed: true });
    expect(layout.dockWidth).toBeLessThanOrEqual(DOCK_DEFAULT);
  });

  it('keeps the list, a 755 wide conversation and the dock at 1920', () => {
    const layout = layoutOf({ windowWidth: 1920, windowHeight: 1080, dockOpen: true });
    expect(layout).toMatchObject({
      areaWidth: 1656,
      listPane: true,
      dock: 'docked',
      dockWidth: DOCK_DEFAULT,
      conversationWidth: 755,
      composerClass: 'regular',
    });
  });

  it('lets a pointer resize the dock between its limits only', () => {
    const wide = { windowWidth: 1920, dockOpen: true };
    expect(layoutOf({ ...wide, dockWidth: 100 }).dockWidth).toBe(DOCK_MIN);
    expect(layoutOf({ ...wide, dockWidth: 5000 }).dockWidth).toBeLessThanOrEqual(DOCK_MAX);
  });

  it('shows the dock as a full pane when the area cannot hold the conversation and the dock', () => {
    const layout = layoutOf({ windowWidth: 768, nav: 'rail', dockOpen: true });
    expect(layout).toMatchObject({ dock: 'pane', dockWidth: 0, conversationWidth: 688 });
  });
});

describe('the list pane follows the open preference', () => {
  it('returns the list width to the conversation when the pane is hidden', () => {
    const layout = layoutOf({ listOpen: false });
    expect(layout.listPane).toBe(false);
    expect(layout.conversationWidth).toBe(1016);
    expect(layoutOf({ listOpen: true }).conversationWidth).toBe(596);
  });
});

describe('the composer class and height class', () => {
  it('switches the composer class at a 400 and 600 wide reading column', () => {
    const at = (area: number): AiLayout =>
      layoutOf({ windowWidth: area, idiom: 'touch', nav: 'bar' });
    expect(at(431).composerClass).toBe('tight');
    expect(at(432).composerClass).toBe('compact');
    expect(at(631).composerClass).toBe('compact');
    expect(at(632).composerClass).toBe('regular');
  });

  it('caps the reading width at 720', () => {
    expect(layoutOf({ windowWidth: 1920, listOpen: false }).readingWidth).toBe(720);
  });

  it('marks windows shorter than 480 as short', () => {
    expect(layoutOf({ windowHeight: 479 }).heightClass).toBe('short');
    expect(layoutOf({ windowHeight: 480 }).heightClass).toBe('normal');
  });
});
