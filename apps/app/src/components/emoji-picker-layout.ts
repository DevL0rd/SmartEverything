const TOUCH_CELL = 48;
const POINTER_CELL = 40;
const CATEGORY_CELL = 56;
const PICKER_VIEWPORT_SHARE = 0.75;
const SHEET_CHROME = 88;
const DIALOG_CHROME = 144;
const PAGINATION_HEIGHT = 56;
const MINIMUM_BROWSE_ROWS = 2;

interface PickerSpace {
  readonly width: number;
  readonly height: number;
  readonly controlsHeight: number;
  readonly count: number;
  readonly pointer: boolean;
}

export interface EmojiPickerLayout {
  readonly cellWidth: number;
  readonly categoryWidth: number;
  readonly pageSize: number;
}

export function emojiPickerLayout(space: PickerSpace): EmojiPickerLayout {
  const cell = space.pointer ? POINTER_CELL : TOUCH_CELL;
  const columns = Math.max(1, Math.floor(space.width / cell));
  const categoryColumns = Math.max(1, Math.floor(space.width / CATEGORY_CELL));
  const chrome = space.pointer ? DIALOG_CHROME : SHEET_CHROME;
  const overhead = chrome + space.controlsHeight;
  const browseHeight = overhead + MINIMUM_BROWSE_ROWS * cell + PAGINATION_HEIGHT;
  const available = Math.min(
    space.height,
    Math.max(space.height * PICKER_VIEWPORT_SHARE, browseHeight),
  );
  const gridHeight = available - overhead;
  const capacity = Math.max(1, Math.floor(gridHeight / cell)) * columns;
  const rows = Math.max(1, Math.floor((gridHeight - PAGINATION_HEIGHT) / cell));
  return {
    cellWidth: Math.max(cell, Math.floor(space.width / columns)),
    categoryWidth: Math.max(CATEGORY_CELL, Math.floor(space.width / categoryColumns)),
    pageSize: space.count <= capacity ? capacity : rows * columns,
  };
}
