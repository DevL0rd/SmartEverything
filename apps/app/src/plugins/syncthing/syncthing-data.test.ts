import { describe, expect, it } from 'vitest';
import { currentWidgetType } from '../shared/widget-aliases';
import { SYNCTHING_WIDGET_ALIASES } from './syncthing-data';
import { SYNCTHING_WIDGETS } from './syncthing-widgets';

const plugin = { widgetAliases: SYNCTHING_WIDGET_ALIASES };

describe('Syncthing widget aliases', () => {
  it.each(['syncthing.health', 'syncthing.folders', 'syncthing.devices'])(
    'resolves the old board type %s to the merged Sync widget',
    (old) => {
      expect(currentWidgetType([plugin], old)).toBe('syncthing-sync');
    },
  );

  it.each(['syncthing-health', 'syncthing-folders', 'syncthing-devices'])(
    'resolves the old home type %s to the merged Sync widget',
    (old) => {
      expect(currentWidgetType([plugin], old)).toBe('syncthing-sync');
    },
  );

  it('points only at a widget that exists', () => {
    const types = SYNCTHING_WIDGETS.map((widget) => widget.type);
    for (const target of Object.values(SYNCTHING_WIDGET_ALIASES)) {
      expect(types).toContain(target);
    }
  });

  it('leaves current types alone', () => {
    expect(currentWidgetType([plugin], 'syncthing-sync')).toBe('syncthing-sync');
  });
});
