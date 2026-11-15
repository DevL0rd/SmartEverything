export type PickState = boolean | 'mixed';

export function pickStateOf(picked: number, shown: number): PickState {
  if (picked === 0) return false;
  return picked >= shown ? true : 'mixed';
}
