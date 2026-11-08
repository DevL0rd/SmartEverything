import { describe, expect, it } from 'vitest';

describe('vacuum page and face modules', () => {
  it('load without a browser or a device', async () => {
    const modules = await Promise.all([
      import('./page'),
      import('./page-reveal'),
      import('./faces'),
      import('./face-parts'),
      import('./face-options'),
      import('./sections/overview'),
      import('./sections/rooms'),
      import('./sections/zones'),
      import('./sections/schedules'),
      import('./sections/history'),
      import('./sections/dock'),
      import('./sections/care'),
      import('./sections/settings'),
      import('./sections/settings-other'),
      import('./sections/clean-modes'),
      import('./sections/clean-more'),
      import('./page-homes'),
      import('../detail/device-screen'),
      import('../card/family-cards'),
      import('../../device-visuals'),
      import('../../../search/family-items'),
    ]);
    const [page, reveal, faces] = modules;
    expect(typeof page.VacuumPage).toBe('function');
    expect(typeof reveal.RevealBox).toBe('function');
    expect(typeof faces.VacuumFace).toBe('function');
    expect(modules.every((loaded) => Object.keys(loaded).length > 0)).toBe(true);
  });
});
