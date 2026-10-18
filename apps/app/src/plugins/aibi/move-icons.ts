import type { IconName } from '../../components/icon';

const MOVE_ICONS: Readonly<Record<string, IconName>> = {
  ability_dance: 'sparkles',
  ability_sing: 'music',
  ability_music_box: 'music',
  ability_music_listen: 'audioLines',
  ability_animal: 'dog',
  ability_alarm_set: 'alarmClock',
  ability_timer: 'timer',
  ability_time: 'clock',
  ability_weather: 'weather',
  ability_take_photo: 'camera',
  ability_show_photo: 'image',
  ability_dice: 'box',
  ability_chatgpt: 'messageCircle',
  ability_light_control: 'bulb',
  interact_game_rps: 'gamepad',
  interact_game_stopwatch: 'timer',
  behavior_sleep: 'bed',
  behavior_quiet: 'muted',
  function_set_volume: 'volume',
  function_show_battery: 'battery',
};

export function moveIcon(id: string): IconName {
  return MOVE_ICONS[id] ?? 'move';
}
