import { describe, expect, it } from 'vitest';
import { currentWidgetType } from './widget-aliases';

const plugins = [
  { widgetAliases: { 'router.internet': 'router-internet', 'router.speed': 'router-internet' } },
  { widgetAliases: { 'syncthing.folders': 'syncthing-sync' } },
  {},
];

describe('currentWidgetType', () => {
  it('resolves an old dotted type to the type that replaced it', () => {
    expect(currentWidgetType(plugins, 'router.internet')).toBe('router-internet');
    expect(currentWidgetType(plugins, 'router.speed')).toBe('router-internet');
    expect(currentWidgetType(plugins, 'syncthing.folders')).toBe('syncthing-sync');
  });

  it('leaves a current or unknown type as it is', () => {
    expect(currentWidgetType(plugins, 'router-internet')).toBe('router-internet');
    expect(currentWidgetType(plugins, 'weather')).toBe('weather');
  });
});
