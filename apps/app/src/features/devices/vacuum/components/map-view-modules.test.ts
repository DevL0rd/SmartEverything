import { describe, expect, it } from 'vitest';

describe('map view modules', () => {
  it('load without a browser or a device', async () => {
    const view = await import('./map-view');
    const stage = await import('./vacuum-stage');
    const map3d = await import('./map-3d-view');
    const full = await import('../../../home-map/components/stage/full-screen');
    expect(typeof view.MapView).toBe('function');
    expect(typeof stage.MapStage).toBe('function');
    expect(typeof map3d.Map3dView).toBe('function');
    expect(typeof full.StageFullScreen).toBe('function');
  });
});
