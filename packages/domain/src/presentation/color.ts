import { z } from 'zod';
import { hsvToPackedRgb, packedRgbToHsv } from '../color';
import {
  COLOR_FORMAT_REASON,
  HSV_COLOR,
  InvalidValueError,
  type HsvColor,
  type JsonValue,
} from '../values';
import type { CapabilityPresentation } from './types';

const PACKED_RGB_MAX = 0xffffff;
const PACKED_RGB = z.number().int().min(0).max(PACKED_RGB_MAX);

export function readPresentedColor(
  presented: Pick<CapabilityPresentation, 'colorEncoding'>,
  value: JsonValue | undefined,
): HsvColor | null {
  if (presented.colorEncoding === 'packed_rgb') {
    const parsed = PACKED_RGB.safeParse(value);
    return parsed.success ? packedRgbToHsv(parsed.data) : null;
  }
  const parsed = HSV_COLOR.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function writePresentedColor(
  presented: Pick<CapabilityPresentation, 'colorEncoding'>,
  color: HsvColor,
): JsonValue {
  const parsed = HSV_COLOR.safeParse(color);
  if (!parsed.success) {
    throw new InvalidValueError({ kind: 'color' }, color, COLOR_FORMAT_REASON);
  }
  return presented.colorEncoding === 'packed_rgb' ? hsvToPackedRgb(parsed.data) : parsed.data;
}
