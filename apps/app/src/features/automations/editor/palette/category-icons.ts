import type { IconName } from '../../../../components/icon';
import type { PaletteSectionId } from './palette-categories';

export const SECTION_ICONS: Readonly<Record<PaletteSectionId, IconName>> = {
  triggers: 'bell',
  flow: 'route',
  logic: 'filter',
  math: 'plus',
  text: 'fileText',
  lists: 'list',
  objects: 'box',
  time: 'clock',
  random: 'refresh',
  variables: 'key',
  devices: 'plug',
  state: 'timer',
  people: 'users',
  notify: 'messageCircle',
  computers: 'monitor',
  cameras: 'camera',
  ai: 'sparkles',
  web: 'globe',
  automations: 'automations',
  reusable: 'puzzle',
  debug: 'wrench',
  utilities: 'settings',
  snippets: 'paperclip',
};
