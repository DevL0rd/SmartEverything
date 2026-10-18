import type { FamilySearchItem } from '../../../search/family-items';

export const MICROWAVE_SEARCH_ITEMS: readonly FamilySearchItem[] = [
  {
    key: 'cooking-program',
    title: 'Cooking program',
    page: 'controls',
    icon: 'heater',
    keywords: [
      'cook',
      'start cooking',
      'heat',
      'reheat',
      'defrost',
      'bake',
      'air fry',
      'grill',
      'convection',
      'freshen',
      'deodorize',
      'timer',
      'time',
      'power level',
      'temperature',
      'mode',
    ],
  },
  {
    key: 'notify-ready',
    title: 'Notify me when food is ready',
    page: 'overview',
    icon: 'bell',
    keywords: ['notification', 'alert', 'done', 'finished', 'ready', 'beep', 'remind', 'tell me'],
  },
  {
    key: 'notify-inside',
    title: 'Notify me if food is still inside',
    page: 'overview',
    icon: 'bell',
    keywords: ['forgot', 'forgotten', 'left inside', 'door', 'reminder', 'remind', 'notification'],
  },
  {
    key: 'recent-cooking',
    title: 'Recent cooking',
    page: 'overview',
    icon: 'clock',
    keywords: ['history', 'cycles', 'last cooked', 'what did I cook', 'log', 'finished'],
  },
];
