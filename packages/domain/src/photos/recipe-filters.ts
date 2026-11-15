import type { PhotoFilter } from './edit-recipe';
import {
  type ColourMatrix,
  gainMatrix,
  lumaMatrix,
  matrixAfter,
  saturationMatrix,
  scaleMatrix,
} from './recipe-matrix';

const SEPIA: ColourMatrix = [
  0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0,
];

export const FILTER_MATRICES: Readonly<Record<PhotoFilter, ColourMatrix>> = {
  vivid: matrixAfter(saturationMatrix(1.35), gainMatrix(1.06, -0.03)),
  warm: scaleMatrix(1.08, 1, 0.9),
  cool: scaleMatrix(0.92, 1, 1.08),
  mono: lumaMatrix(1, 0),
  noir: lumaMatrix(1.25, -0.12),
  sepia: SEPIA,
  fade: matrixAfter(saturationMatrix(0.85), gainMatrix(0.85, 0.08)),
  dramatic: matrixAfter(saturationMatrix(0.8), gainMatrix(1.25, -0.12)),
  vintage: matrixAfter(
    matrixAfter(saturationMatrix(0.75), scaleMatrix(1.06, 1, 0.9)),
    gainMatrix(0.9, 0.06),
  ),
  chrome: matrixAfter(saturationMatrix(1.15), gainMatrix(1.12, -0.06)),
};
