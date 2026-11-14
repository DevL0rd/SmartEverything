export interface Natural {
  readonly width: number;
  readonly height: number;
}

export function fitScale(room: Natural, natural: Natural | null): number {
  if (natural === null || natural.width <= 0 || natural.height <= 0) {
    return 1;
  }
  return Math.min(1, room.width / natural.width, room.height / natural.height);
}
