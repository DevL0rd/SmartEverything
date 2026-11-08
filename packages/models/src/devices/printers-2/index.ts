import type { ModelSpec } from '@smarteverything/domain';
import { LASER_PRINTER_MODEL } from './laser';
import { PRINTER_3D_MODEL } from './printer-3d';

export { LASER_PRINTER_MODEL, PRINTER_3D_MODEL };

export const PRINTER_2_MODELS: readonly ModelSpec[] = [LASER_PRINTER_MODEL, PRINTER_3D_MODEL];
