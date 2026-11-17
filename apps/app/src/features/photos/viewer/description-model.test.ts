import { describe, expect, it } from 'vitest';
import type { MediaInfo } from '@smarteverything/domain';
import { describedMedia, descriptionChangeOf } from './description-model';

const FILE = { text: 'Sunset at the harbour', source: 'file' } as const;

describe('description edits', () => {
  it('saves only a real change and clears with an empty field', () => {
    expect(descriptionChangeOf('  Sunset at the harbour ', FILE)).toBeNull();
    expect(descriptionChangeOf('', null)).toBeNull();
    expect(descriptionChangeOf('Our boat ', FILE)).toEqual({ text: 'Our boat' });
    expect(descriptionChangeOf('   ', FILE)).toEqual({ text: null });
    expect(descriptionChangeOf('New', null)).toEqual({ text: 'New' });
  });

  it('shows the saved text as written by hand straight away', () => {
    const media: MediaInfo = {
      itemId: '0d000000-0000-4000-8000-000000000001',
      timeSource: 'exif',
      tzOffsetMin: null,
      motionClipId: null,
      liveId: null,
      burstId: null,
      stackId: null,
      placeId: null,
      description: FILE,
      preview: { state: 'ready' },
      poster: { state: 'none' },
      playable: { state: 'none' },
    };
    expect(describedMedia(media, { text: 'Ours' }).description).toEqual({
      text: 'Ours',
      source: 'manual',
    });
    expect(describedMedia(media, { text: null }).description).toBeNull();
  });
});
