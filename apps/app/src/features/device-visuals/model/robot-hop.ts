export interface HopInput {
  readonly seen: string | null;
  readonly at: string | null;
  readonly playing: boolean;
}

export function shouldHop({ seen, at, playing }: HopInput): boolean {
  return playing && at !== null && at !== seen;
}
