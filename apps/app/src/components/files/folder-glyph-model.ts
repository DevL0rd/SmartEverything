import { DRIVE_FOLDER_COLOURS, type DriveFolderColour } from '@smarteverything/domain';
import type { ColourRole } from '../../design/tokens';

export type FolderGlyphWell = 's' | 'm' | 'l';

export const FOLDER_COLOUR_ROLE: Readonly<Record<DriveFolderColour, ColourRole>> = {
  'viz-1': 'viz-1',
  'viz-2': 'viz-2',
  'viz-3': 'viz-3',
  'viz-4': 'viz-4',
  'viz-5': 'viz-5',
  'viz-6': 'viz-6',
  'viz-7': 'viz-blue',
  'viz-8': 'viz-magenta',
};

export const FOLDER_COLOUR_LABEL: Readonly<Record<DriveFolderColour, string>> = {
  'viz-1': 'Teal',
  'viz-2': 'Amber',
  'viz-3': 'Lavender',
  'viz-4': 'Coral',
  'viz-5': 'Lime',
  'viz-6': 'Periwinkle',
  'viz-7': 'Blue',
  'viz-8': 'Magenta',
};

export const NO_COLOUR_LABEL = 'No colour';

export const BADGE_MIN_GLYPH = 20;

const WELL_BOX: Readonly<Record<FolderGlyphWell, number>> = { s: 28, m: 36, l: 48 };

const PLAIN_BOX = 20;

export interface FolderLook {
  readonly colour: DriveFolderColour | null;
  readonly iconHint: boolean;
}

export interface FolderGlyphLook {
  readonly colour: ColourRole;
  readonly box: number;
  readonly badge: number | null;
  readonly label: string;
}

export function folderColourRoleOf(colour: DriveFolderColour | null): ColourRole {
  return colour === null ? 'primary' : FOLDER_COLOUR_ROLE[colour];
}

export function folderGlyphOf(folder: FolderLook, well: FolderGlyphWell | null): FolderGlyphLook {
  const box = well === null ? PLAIN_BOX : WELL_BOX[well];
  const badge = folder.iconHint && box >= BADGE_MIN_GLYPH ? Math.round(box / 2) : null;
  const colour = folder.colour === null ? null : FOLDER_COLOUR_LABEL[folder.colour];
  const parts = [colour === null ? 'Folder' : `${colour} folder`];
  if (badge !== null) parts.push('with its own icon');
  return { colour: folderColourRoleOf(folder.colour), box, badge, label: parts.join(' ') };
}

export interface ColourChoice {
  readonly colour: DriveFolderColour;
  readonly role: ColourRole;
  readonly label: string;
  readonly selected: boolean;
}

export function colourChoicesOf(current: DriveFolderColour | null): readonly ColourChoice[] {
  return DRIVE_FOLDER_COLOURS.map((colour) => ({
    colour,
    role: FOLDER_COLOUR_ROLE[colour],
    label: FOLDER_COLOUR_LABEL[colour],
    selected: current === colour,
  }));
}
