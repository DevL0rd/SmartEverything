const VIDEO_ASPECT = 16 / 9;

const MONITOR_TILE_GAP = 2;

interface WallSize {
  readonly width: number;
  readonly height: number;
}

interface TileBox extends WallSize {
  readonly left: number;
  readonly top: number;
}

function dividedSize(total: number, parts: number): number {
  return Math.max(0, (total - MONITOR_TILE_GAP * (parts - 1)) / parts);
}

function grid(size: WallSize, count: number, columns: number): readonly TileBox[] {
  const height = dividedSize(size.height, Math.ceil(count / columns));
  return Array.from({ length: count }, (_, index) => {
    const first = index - (index % columns);
    const width = dividedSize(size.width, Math.min(count - first, columns));
    return {
      width,
      height,
      left: (index - first) * (width + MONITOR_TILE_GAP),
      top: (first / columns) * (height + MONITOR_TILE_GAP),
    };
  });
}

function pictureArea(tiles: readonly TileBox[]): number {
  return tiles.reduce((area, { width, height }) => {
    const pictureWidth = Math.min(width, height * VIDEO_ASPECT);
    return area + pictureWidth ** 2 / VIDEO_ASPECT;
  }, 0);
}

export function monitorLayout(size: WallSize, count: number, live: boolean): readonly TileBox[] {
  if (count === 0 || size.width === 0 || size.height === 0) return [];
  const square = grid(size, count, Math.ceil(Math.sqrt(count)));
  if (!live) return square;
  let best = square;
  let area = pictureArea(square);
  for (let columns = 1; columns <= count; columns += 1) {
    const candidate = grid(size, count, columns);
    const candidateArea = pictureArea(candidate);
    if (candidateArea > area) {
      best = candidate;
      area = candidateArea;
    }
  }
  return best;
}
