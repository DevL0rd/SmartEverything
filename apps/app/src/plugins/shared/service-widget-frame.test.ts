import { describe, expect, it } from 'vitest';
import { figureFitOf, noticeShapeOf, serviceLayoutOf } from './service-widget-frame';

describe('serviceLayoutOf', () => {
  it('picks one face per shared frame class', () => {
    const faces = [
      { width: 150, height: 140, idiom: 'touch' },
      { width: 348, height: 100, idiom: 'touch' },
      { width: 348, height: 140, idiom: 'touch' },
      { width: 348, height: 324, idiom: 'touch' },
      { width: 1072, height: 120, idiom: 'pointer' },
      { width: 1072, height: 296, idiom: 'pointer' },
    ] as const;
    expect(faces.map((frame) => serviceLayoutOf(frame, 48, false).face)).toEqual([
      'tile',
      'compact',
      'compact',
      'tall',
      'wide',
      'wide-tall',
    ]);
  });

  it('leaves the action band its control height below the content room', () => {
    const medium = { width: 348, height: 140, idiom: 'touch' } as const;
    expect(serviceLayoutOf(medium, 48, false).room).toBe(86);
    expect(serviceLayoutOf(medium, 48, true).room).toBe(38);
    expect(serviceLayoutOf({ width: 1072, height: 120, idiom: 'pointer' }, 36, true).room).toBe(38);
    expect(serviceLayoutOf({ width: 348, height: 40, idiom: 'touch' }, 48, true).room).toBe(0);
  });
});

describe('figureFitOf', () => {
  it('uses the large figure when the tier is tall', () => {
    expect(figureFitOf(223, 'touch')).toEqual({ figure: 'l', caption: 'footnote', gap: 'gap-1' });
    expect(figureFitOf(60, 'touch')).toEqual({ figure: 'm', caption: 'footnote', gap: 'gap-1' });
  });

  it('shrinks the figure and caption so a Medium with a band keeps both lines', () => {
    expect(figureFitOf(47, 'touch')).toEqual({ figure: 's', caption: 'footnote', gap: 'gap-0.5' });
    expect(figureFitOf(39, 'pointer')).toEqual({ figure: 's', caption: 'caption', gap: 'gap-0' });
    expect(figureFitOf(38, 'touch')).toEqual({ figure: 's', caption: 'caption', gap: 'gap-0' });
  });
});

describe('noticeShapeOf', () => {
  it('fits the off and set-up notice into a Medium above its band', () => {
    expect(noticeShapeOf(38, 'touch')).toEqual({ well: 'm', titleLines: 1, bodyLines: 1 });
    expect(noticeShapeOf(20, 'pointer')).toEqual({ well: 's', titleLines: 1, bodyLines: 1 });
  });

  it('lets the title and body wrap when the tier has room', () => {
    expect(noticeShapeOf(86, 'touch')).toEqual({ well: 'l', titleLines: 2, bodyLines: 2 });
  });
});
