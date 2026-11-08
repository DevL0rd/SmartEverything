import { describe, expect, it } from 'vitest';
import {
  BOARD_LAYOUT_VERSION,
  arrangementOf,
  type BoardLayout,
  type BoardWidget,
} from '@smarteverything/domain';
import { withoutRetired } from '../../../components/widget-board/retired';
import { withWidgetAdded } from './add-widget';
import { HOME_RETIRED, homeDefaults } from './defaults';

const scenes: BoardWidget = { key: 'scenes', type: 'scenes', size: 'W' };
const weather: BoardWidget = { key: 'weather', type: 'weather', size: 'M' };
const added: BoardWidget = {
  key: 'group:1',
  type: 'device-group',
  size: 'XL',
  options: { target: { kind: 'group', groupId: '1' } },
};
const defaults = {
  compact: [scenes],
  medium: [scenes, weather],
  expanded: [weather],
};
const empty: BoardLayout = { version: BOARD_LAYOUT_VERSION, classes: {} };

describe('adding a widget to the Home layout', () => {
  it('overlays the widget on the defaults of every board that was never edited', () => {
    const layout = withWidgetAdded(empty, defaults, added);
    expect(layout?.classes).toStrictEqual({});
    expect(arrangementOf(layout ?? null, 'compact', defaults)).toStrictEqual([scenes, added]);
    expect(arrangementOf(layout ?? null, 'medium', defaults)).toStrictEqual([
      scenes,
      weather,
      added,
    ]);
    expect(arrangementOf(layout ?? null, 'expanded', defaults)).toStrictEqual([weather, added]);
  });

  it('lets later default changes still reach the boards the person did not customise', () => {
    const layout = withWidgetAdded(empty, defaults, added) ?? empty;
    const changed = { ...defaults, medium: [weather, scenes] };
    expect(arrangementOf(layout, 'medium', changed)).toStrictEqual([weather, scenes, added]);
  });

  it('keeps an edited board as the person left it and appends at the end', () => {
    const stored: BoardLayout = {
      version: BOARD_LAYOUT_VERSION,
      classes: { compact: { widgets: [weather] } },
    };
    const layout = withWidgetAdded(stored, defaults, added);
    expect(layout?.classes.compact?.widgets).toStrictEqual([weather, added]);
    expect(arrangementOf(layout ?? null, 'medium', defaults)).toStrictEqual([
      scenes,
      weather,
      added,
    ]);
  });

  it('adds nothing to a board that already shows the widget, and says so when none needs it', () => {
    const stored: BoardLayout = {
      version: BOARD_LAYOUT_VERSION,
      classes: { compact: { widgets: [added] } },
    };
    const layout = withWidgetAdded(stored, defaults, added);
    expect(layout?.classes.compact?.widgets).toStrictEqual([added]);
    const everywhere: BoardLayout = {
      version: BOARD_LAYOUT_VERSION,
      classes: {
        compact: { widgets: [added] },
        medium: { widgets: [added] },
        expanded: { widgets: [added] },
      },
    };
    expect(withWidgetAdded(everywhere, defaults, added)).toBeNull();
    expect(
      withWidgetAdded(empty, { compact: [added], medium: [added], expanded: [added] }, added),
    ).toBeNull();
  });
});

describe('the retired Indoors glance', () => {
  const glance: BoardWidget = { key: 'glance', type: 'glance', size: 'W' };

  it('is gone from every default board', () => {
    const defaults = homeDefaults({ count: 1, offline: 0, featured: [], spotlightable: [] }, []);
    const types = [...defaults.compact, ...defaults.medium, ...defaults.expanded].map(
      (widget) => widget.type,
    );
    expect(types).not.toContain('glance');
    expect(types.slice(0, 2)).toStrictEqual(['weather', 'scenes']);
  });

  it('is dropped from a saved layout and from its added widgets', () => {
    const layout: BoardLayout = {
      version: BOARD_LAYOUT_VERSION,
      classes: { compact: { widgets: [glance, weather] } },
      added: { medium: { widgets: [glance, added] } },
    };
    const state = withoutRetired({ status: 'ready', layout }, HOME_RETIRED);
    expect(state).toStrictEqual({
      status: 'ready',
      layout: {
        version: BOARD_LAYOUT_VERSION,
        classes: { compact: { widgets: [weather] } },
        added: { medium: { widgets: [added] } },
      },
    });
  });
});
