import { TYPE_SCALE, type Idiom } from '../../../design/tokens';

export function emptyLinesOf(room: number, idiom: Idiom): number {
  const type = TYPE_SCALE[idiom];
  return Math.max(1, Math.floor((room - type.body[1]) / type.footnote[1]));
}
