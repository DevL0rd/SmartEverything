import type { RowEntry } from './device-row-set';
import { CostEstimateRow, LookRow, MemoryRow, VideoModeRow } from './video-rows';

export const VIDEO_ROWS: readonly RowEntry[] = [
  {
    id: 'call.video-mode',
    title: 'Video mode',
    keywords: [
      'video',
      'live video',
      'on demand',
      'still',
      'camera',
      'screenshot',
      'cost',
      'cheap',
    ],
    component: VideoModeRow,
  },
  {
    id: 'call.video-memory',
    title: 'Video memory',
    keywords: ['video memory', 'memory', 'frames', 'seconds', 'tokens', 'cost'],
    component: MemoryRow,
  },
  {
    id: 'call.video-look',
    title: 'May look at on its own',
    keywords: ['look', 'see', 'allow', 'camera', 'screen', 'window', 'privacy', 'looks'],
    component: LookRow,
  },
  {
    id: 'call.video-cost',
    title: 'Estimated cost of video',
    keywords: ['cost', 'price', 'cents', 'video cost'],
    component: CostEstimateRow,
  },
];
