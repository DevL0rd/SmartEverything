import { describe, expect, it } from 'vitest';
import { BOARD_LAYOUT_VERSION, type BoardLayout, type BoardWidget } from '@smarteverything/domain';
import { withWidgetAdded } from './add-widget';

const glance: BoardWidget = { key: 'glance', type: 'glance', size: 'W' };
const weather: BoardWidget = { key: 'weather', type: 'weather', size: 'M' };
const added: BoardWidget = {
  key: 'group:1',
  type: 'device-group',
  size: 'XL',
  options: { target: { kind: 'group', groupId: '1' } },
};
const defaults = {
  compact: [glance],
  medium: [glance, weather],
  expanded: [weather],
};
const empty: BoardLayout = { version: BOARD_LAYOUT_VERSION, classes: {} };

describe('adding a widget to the Home layout', () => {
  it('starts from the default arrangement of every board that was never edited', () => {
    const layout = withWidgetAdded(empty, defaults, added);
    expect(layout?.classes.compact?.widgets).toStrictEqual([glance, added]);
    expect(layout?.classes.medium?.widgets).toStrictEqual([glance, weather, added]);
    expect(layout?.classes.expanded?.widgets).toStrictEqual([weather, added]);
  });

  it('keeps an edited board as the person left it and appends at the end', () => {
    const stored: BoardLayout = {
      version: BOARD_LAYOUT_VERSION,
      classes: { compact: { widgets: [weather] } },
    };
    const layout = withWidgetAdded(stored, defaults, added);
    expect(layout?.classes.compact?.widgets).toStrictEqual([weather, added]);
    expect(layout?.classes.medium?.widgets).toStrictEqual([glance, weather, added]);
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
