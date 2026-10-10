import { newChatWidgets, type ChatWidget, type HealthMetric } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { widgetsFor, type WidgetFacts } from '../src/chat-widgets/widget-rules';

const LAMP = '11111111-1111-4111-8111-111111111111';
const CAMERA = '22222222-2222-4222-8222-222222222222';
const TV_REMOTE = '33333333-3333-4333-8333-333333333333';

const FACTS: WidgetFacts = {
  deviceWidget: (id) => {
    if (id === LAMP) {
      return { kind: 'device', id };
    }
    return id === CAMERA ? { kind: 'camera', id } : null;
  },
  remoteId: (remote) => (remote === 'TV' || remote === TV_REMOTE ? TV_REMOTE : null),
  pluginIds: () => [],
};

function shown(
  name: string,
  args: Readonly<Record<string, unknown>>,
  output: unknown = null,
): ChatWidget[] {
  return widgetsFor(name, { args, output }, FACTS);
}

describe('widgets for tool calls', () => {
  it('shows the device a control tool changed', () => {
    expect(shown('set_power', { deviceId: LAMP, on: true })).toEqual([
      { kind: 'device', id: LAMP },
    ]);
  });

  it('shows cameras as camera widgets and skips unknown ids', () => {
    const args = { deviceIds: [CAMERA, '99999999-9999-4999-8999-999999999999'] };
    expect(shown('take_camera_snapshots', args)).toEqual([{ kind: 'camera', id: CAMERA }]);
  });

  it('does not show widgets for broad listings', () => {
    expect(shown('list_devices', { deviceIds: [LAMP] })).toEqual([]);
  });

  it('shows the remote a button was pressed on, by name', () => {
    expect(shown('press_remote_button', { remote: 'TV', button: 'Power' })).toEqual([
      { kind: 'remote', id: TV_REMOTE },
    ]);
  });

  it('shows food widgets for food logs and nutrition metrics', () => {
    expect(shown('log_food', { what: 'food', food: 'apple' })).toEqual([
      { kind: 'nutrition', part: 'calories' },
      { kind: 'nutrition', part: 'macros' },
    ]);
    const daily = { query: { metrics: 'energy_in,steps', from: '2026-10-01', to: '2026-10-10' } };
    expect(shown('read_health_daily', daily)).toEqual([
      { kind: 'nutrition', part: 'calories' },
      { kind: 'health', metric: 'steps', range: 'week' },
    ]);
  });

  it('ignores words that are not metrics', () => {
    expect(shown('get_health_summary', { metrics: ['nonsense'] })).toEqual([]);
  });
});

describe('link cards for changes', () => {
  const AUTOMATION = '44444444-4444-4444-8444-444444444444';
  const SCENE = '55555555-5555-4555-8555-555555555555';

  it('links to the exact setting it changed, with the new value', () => {
    expect(shown('update_assistant_settings', { name: 'Jarvis' })).toEqual([
      { kind: 'setting_link', setting: 'assistant.name', value: 'Jarvis' },
    ]);
    expect(shown('update_assistant_settings', { activity_steps: false })).toEqual([
      { kind: 'setting_link', setting: 'assistant.steps', value: 'Off' },
    ]);
  });

  it('links nested goal changes to their own row', () => {
    expect(shown('set_goals', { fitness: { goals: { steps: 9000 } } })).toEqual([
      { kind: 'setting_link', setting: 'fitness-goal-steps', value: '9000' },
    ]);
    expect(shown('set_goals', { nutrition: { proteinG: 120 } })).toEqual([
      { kind: 'setting_link', setting: 'nutrition-goal-proteinG', value: '120' },
    ]);
  });

  it('falls back to the settings page when no row matches', () => {
    expect(shown('update_home', { name: 'Cabin' })).toEqual([
      { kind: 'setting_link', setting: 'home', value: 'Cabin' },
    ]);
    expect(shown('update_home', { name: 'Cabin', time_zone: 'UTC' })).toEqual([
      { kind: 'setting_link', setting: 'home', value: null },
    ]);
  });

  it('links to device settings instead of controls for device settings tools', () => {
    expect(shown('update_device', { what: 'device', deviceId: LAMP, name: 'Desk lamp' })).toEqual([
      { kind: 'device_settings_link', id: LAMP, value: 'Desk lamp' },
    ]);
  });

  it('reads through call_operation', () => {
    const args = { operation: 'updateDevice', arguments: { deviceId: LAMP, hidden: true } };
    expect(shown('call_operation', args)).toEqual([
      { kind: 'device_settings_link', id: LAMP, value: 'On' },
    ]);
  });

  it('links to a new automation from the tool result, and to a scene it ran', () => {
    expect(
      shown('create_automation', { name: 'Night' }, { result: { id: AUTOMATION, name: 'Night' } }),
    ).toEqual([{ kind: 'automation_link', id: AUTOMATION, value: 'Night' }]);
    expect(shown('run_scene', { sceneId: SCENE })).toEqual([
      { kind: 'scene_link', id: SCENE, value: null },
    ]);
  });
});

describe('new chat widgets', () => {
  const steps: ChatWidget = { kind: 'health', metric: 'steps', range: 'week' };

  it('drops widgets already shown or repeated', () => {
    const wanted: ChatWidget[] = [
      { kind: 'weather' },
      { kind: 'weather' },
      { kind: 'scenes' },
      steps,
    ];
    expect(newChatWidgets([{ kind: 'scenes' }], wanted)).toEqual([{ kind: 'weather' }, steps]);
  });

  it('never goes past six widgets on one reply', () => {
    const metrics: HealthMetric[] = ['steps', 'sleep', 'weight', 'floors', 'distance'];
    const known = metrics.map((metric): ChatWidget => ({ kind: 'health', metric, range: 'week' }));
    expect(newChatWidgets(known, [{ kind: 'weather' }, { kind: 'scenes' }])).toEqual([
      { kind: 'weather' },
    ]);
  });
});

describe('widgets for served tools', () => {
  const FOOD: ChatWidget[] = [
    { kind: 'nutrition', part: 'calories' },
    { kind: 'nutrition', part: 'macros' },
  ];
  const yesterday = { from: '2026-10-09T00:00:00+07:00', to: '2026-10-10T00:00:00+07:00' };
  const onYesterday = (widgets: readonly ChatWidget[]): ChatWidget[] =>
    widgets.map((widget) =>
      widget.kind === 'health' || widget.kind === 'nutrition'
        ? { ...widget, day: '2026-10-09' }
        : widget,
    );

  it.each<[string, string, Readonly<Record<string, unknown>>, ChatWidget[]]>([
    [
      'devices',
      'control_devices',
      { deviceIds: [LAMP], changes: [{ key: 'power', value: true }] },
      [{ kind: 'device', id: LAMP }],
    ],
    [
      'cameras',
      'camera_pictures',
      { view: 'live', deviceIds: [CAMERA] },
      [{ kind: 'camera', id: CAMERA }],
    ],
    [
      'health',
      'read_health',
      { view: 'daily', from: '2026-10-01', to: '2026-10-09', metrics: ['steps'] },
      [{ kind: 'health', metric: 'steps', range: 'week' }],
    ],
    [
      'food records',
      'read_health',
      { view: 'records', types: ['Nutrition'], ...yesterday },
      onYesterday(FOOD),
    ],
    ['food entries', 'read_health', { view: 'entries', ...yesterday }, onYesterday(FOOD)],
    ['food log', 'log_food', { what: 'food', food: 'apple' }, FOOD],
    ['weather', 'get_weather', { view: 'now' }, [{ kind: 'weather' }]],
    ['scenes', 'list_scenes', {}, [{ kind: 'scenes' }]],
    [
      'remotes',
      'press_remote_button',
      { remote: 'TV', button: 'Power' },
      [{ kind: 'remote', id: TV_REMOTE }],
    ],
  ])('%s: %s', (_area, tool, args, widgets) => {
    expect(shown(tool, args)).toEqual(widgets);
  });

  it('shows a widget per record type, food and body measures alike', () => {
    expect(
      shown('read_health', { view: 'records', types: ['Weight', 'Hydration'], ...yesterday }),
    ).toEqual([
      { kind: 'health', metric: 'weight', range: 'week', day: '2026-10-09' },
      { kind: 'nutrition', part: 'hydration', day: '2026-10-09' },
    ]);
  });
});
