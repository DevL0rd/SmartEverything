import { describe, expect, it } from 'vitest';
import {
  INITIAL_FACTS,
  STAGE_NOT_REGISTERED,
  isVisible,
  stageState,
  type StageFacts,
} from './rules';

const visible: StageFacts = {
  onScreen: true,
  screenFocused: true,
  appForeground: true,
  modalCovered: false,
  stillReady: true,
};

describe('isVisible', () => {
  it('is visible only with all four conditions', () => {
    expect(isVisible(visible)).toBe(true);
    expect(isVisible({ ...visible, onScreen: false })).toBe(false);
    expect(isVisible({ ...visible, screenFocused: false })).toBe(false);
    expect(isVisible({ ...visible, appForeground: false })).toBe(false);
    expect(isVisible({ ...visible, modalCovered: true })).toBe(false);
  });

  it('does not depend on anything but the four facts', () => {
    expect(isVisible({ ...visible, stillReady: false })).toBe(true);
    expect(isVisible(INITIAL_FACTS)).toBe(false);
  });
});

describe('stageState', () => {
  it('mounts and goes live as soon as the stage is visible, even before its still is ready', () => {
    const state = stageState(STAGE_NOT_REGISTERED, { ...visible, stillReady: false });
    expect(state).toEqual({ live: true, mounted: true, showStill: false });
  });

  it('never mounts a stage that has not been visible', () => {
    const state = stageState(STAGE_NOT_REGISTERED, { ...visible, onScreen: false });
    expect(state).toEqual({ live: false, mounted: false, showStill: true });
  });

  it('pauses a modal-covered stage but keeps its DOM component', () => {
    const live = stageState(STAGE_NOT_REGISTERED, visible);
    const covered = stageState(live, { ...visible, modalCovered: true });
    expect(covered).toEqual({ live: false, mounted: true, showStill: true });
  });

  it.each([
    ['scrolled out of view', { onScreen: false }],
    ['screen blurred', { screenFocused: false }],
    ['app in background', { appForeground: false }],
  ])('pauses and unmounts when %s once the still is ready', (_name, change) => {
    const live = stageState(STAGE_NOT_REGISTERED, visible);
    const gone = stageState(live, { ...visible, ...change });
    expect(gone).toEqual({ live: false, mounted: false, showStill: true });
  });

  it('pauses but stays mounted while the still is not drawn yet', () => {
    const live = stageState(STAGE_NOT_REGISTERED, { ...visible, stillReady: false });
    const gone = stageState(live, { ...visible, stillReady: false, onScreen: false });
    expect(gone).toEqual({ live: false, mounted: true, showStill: true });
  });

  it('keeps its DOM component warm when another screen shows, even with the still not drawn yet', () => {
    const live = stageState(STAGE_NOT_REGISTERED, { ...visible, stillReady: false });
    const gone = stageState(live, { ...visible, stillReady: false, screenFocused: false });
    expect(gone).toEqual({ live: false, mounted: true, showStill: true });
  });

  it('unmounts at once when the app goes to the background, even with the still not drawn yet', () => {
    const live = stageState(STAGE_NOT_REGISTERED, { ...visible, stillReady: false });
    const gone = stageState(live, { ...visible, stillReady: false, appForeground: false });
    expect(gone).toEqual({ live: false, mounted: false, showStill: true });
  });

  it('mounts a fresh component after a background return', () => {
    const live = stageState(STAGE_NOT_REGISTERED, visible);
    const backgrounded = stageState(live, { ...visible, appForeground: false });
    const back = stageState(backgrounded, visible);
    expect(back).toEqual({ live: true, mounted: true, showStill: false });
  });

  it('unmounts once the still becomes ready while the stage stays hidden', () => {
    const live = stageState(STAGE_NOT_REGISTERED, { ...visible, stillReady: false });
    const hidden = stageState(live, { ...visible, stillReady: false, onScreen: false });
    const ready = stageState(hidden, { ...visible, stillReady: true, onScreen: false });
    expect(ready.mounted).toBe(false);
  });

  it('mounts again when it becomes visible', () => {
    const live = stageState(STAGE_NOT_REGISTERED, visible);
    const gone = stageState(live, { ...visible, onScreen: false });
    const back = stageState(gone, visible);
    expect(back).toEqual({ live: true, mounted: true, showStill: false });
  });

  it('does not unmount a stage that returns from a modal cover', () => {
    const live = stageState(STAGE_NOT_REGISTERED, visible);
    const covered = stageState(live, { ...visible, modalCovered: true });
    const back = stageState(covered, visible);
    expect(back.live).toBe(true);
    expect(back.mounted).toBe(true);
  });
});
