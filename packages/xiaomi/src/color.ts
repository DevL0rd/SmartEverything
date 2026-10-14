import {
  HSV_COLOR,
  hsvToPackedRgb,
  packedRgbToHsv,
  type HsvColor,
  type JsonValue,
} from '@smarteverything/domain';
import { MiotValueError } from './errors';

export function rgbToHsv(rgb: number): HsvColor {
  return packedRgbToHsv(rgb);
}

export function hsvToRgb(subject: string, value: JsonValue): number {
  const parsed = HSV_COLOR.safeParse(value);
  if (!parsed.success) {
    throw new MiotValueError(subject, 'a hue, saturation and value', value);
  }
  return hsvToPackedRgb(parsed.data);
}
