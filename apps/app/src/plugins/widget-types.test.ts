import { describe, expect, it } from 'vitest';
import { WIDGET_TYPE } from '@smarteverything/domain';
import { APP_PLUGINS } from './registry';

describe('plugin widget types', () => {
  it('can all be saved in a board layout', () => {
    const types = APP_PLUGINS.flatMap((plugin) =>
      (plugin.widgets ?? []).map((widget) => widget.type),
    );
    expect(types.length).toBeGreaterThan(0);
    const invalid = types.filter((type) => !WIDGET_TYPE.safeParse(type).success);
    expect(invalid).toEqual([]);
  });

  it('maps every alias to a registered widget type', () => {
    const types = new Set(
      APP_PLUGINS.flatMap((plugin) => (plugin.widgets ?? []).map((widget) => widget.type)),
    );
    const targets = APP_PLUGINS.flatMap((plugin) => Object.values(plugin.widgetAliases ?? {}));
    const own = targets.filter((target) => !types.has(target));
    expect(own).toEqual([]);
  });
});
