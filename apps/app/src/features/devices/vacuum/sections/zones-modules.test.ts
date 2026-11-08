import { describe, expect, it } from 'vitest';

describe('zone editor modules', () => {
  it('load without a browser or a device', async () => {
    const section = await import('./zones');
    const editor = await import('../components/zone-editor/zone-editor');
    const stage = await import('../components/zone-editor/zone-stage');
    const list = await import('../components/zone-editor/zone-list');
    const toolbar = await import('../components/zone-editor/zone-toolbar');
    expect(typeof section.VacuumZones).toBe('function');
    expect(typeof editor.ZoneEditor).toBe('function');
    expect(typeof stage.ZoneStage).toBe('function');
    expect(typeof list.ZoneList).toBe('function');
    expect(typeof toolbar.ZoneToolbar).toBe('function');
  });
});
