export interface SoundWish {
  readonly viewer: boolean;
  readonly mutedPreference: boolean;
}

export function mutedByDefault(wish: SoundWish): boolean {
  return !wish.viewer || wish.mutedPreference;
}
