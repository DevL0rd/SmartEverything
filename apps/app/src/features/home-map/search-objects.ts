import { HOME_MAP_WORDS, STAGE, homeMapEditorHref, pagePath, type MapPage } from './search-shared';

const EDITOR_WORDS = [...HOME_MAP_WORDS, 'edit map', 'editor'];

interface ObjectEntry {
  readonly key: string;
  readonly title: string;
  readonly tool: 'furniture' | 'openings';
  readonly icon: MapPage['icon'];
  readonly keywords: readonly string[];
}

function objectPage(entry: ObjectEntry): MapPage {
  return {
    path: `${STAGE}:${entry.key}`,
    title: entry.title,
    description: 'Home map editor',
    keywords: [...EDITOR_WORDS, ...entry.keywords],
    to: homeMapEditorHref({ tool: entry.tool }),
    parent: pagePath(`${STAGE}:tool:${entry.tool}`),
    icon: entry.icon,
  };
}

const SENSOR_WORDS = [
  'door sensor',
  'window sensor',
  'contact sensor',
  'linked contact sensor',
  'linked lock',
  'lock',
  'open or closed',
  'closed now',
  'open now',
  'drawn open',
  'always drawn closed',
];

const WALL_WORDS = [
  'wall object',
  'wall mounted',
  'on the wall',
  'snap to the wall',
  'mount height',
  'along the wall',
  'facing',
  'picture',
  'shelf',
  'tv',
  'sconce',
  'switch',
  'thermostat',
  'centre on the wall',
];

const RESIZE_WORDS = [
  'resize',
  'size',
  'bigger',
  'smaller',
  'scale',
  'stretch',
  'dimensions',
  'width',
  'length',
  'handles',
  'drag the handles',
  'seats',
  'chaise',
];

const COLOUR_WORDS = [
  'colour',
  'color',
  'style',
  'recolour',
  'finish',
  'fabric',
  'wood',
  'paint furniture',
];

export function objectPages(): readonly MapPage[] {
  return [
    objectPage({
      key: 'door-window-sensors',
      title: 'Door and window sensors',
      tool: 'openings',
      icon: 'door',
      keywords: SENSOR_WORDS,
    }),
    objectPage({
      key: 'wall-objects',
      title: 'Wall objects',
      tool: 'furniture',
      icon: 'layers',
      keywords: WALL_WORDS,
    }),
    objectPage({
      key: 'resize-furniture',
      title: 'Resize furniture',
      tool: 'furniture',
      icon: 'resize',
      keywords: RESIZE_WORDS,
    }),
    objectPage({
      key: 'colour-and-style',
      title: 'Colour and style',
      tool: 'furniture',
      icon: 'palette',
      keywords: COLOUR_WORDS,
    }),
  ];
}
