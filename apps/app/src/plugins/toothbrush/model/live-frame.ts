import type { BrushLiveFrame } from '@smarteverything/domain';

export function newerFrame(live: BrushLiveFrame | null, loaded: BrushLiveFrame): BrushLiveFrame {
  return live !== null && Date.parse(live.at) > Date.parse(loaded.at) ? live : loaded;
}

export function needsRefresh(before: BrushLiveFrame | null, after: BrushLiveFrame): boolean {
  return (
    before?.session !== after.session ||
    before.activity !== after.activity ||
    before.link !== after.link
  );
}

export function isBrushing(frame: Pick<BrushLiveFrame, 'activity'>): boolean {
  return frame.activity === 'brushing' || frame.activity === 'paused';
}
