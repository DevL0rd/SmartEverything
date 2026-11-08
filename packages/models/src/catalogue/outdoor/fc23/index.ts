import type { ModelSpec } from '@smarteverything/domain';
import { PATIO_CHAIR_MODEL } from './chair';
import { BARBECUE_GRILL_MODEL } from './grill';
import { SUN_LOUNGER_MODEL } from './lounger';
import { PARASOL_MODEL } from './parasol';
import { OUTDOOR_SOFA_MODEL } from './sofa';
import { PATIO_TABLE_MODEL } from './table';

export {
  BARBECUE_GRILL_MODEL,
  OUTDOOR_SOFA_MODEL,
  PARASOL_MODEL,
  PATIO_CHAIR_MODEL,
  PATIO_TABLE_MODEL,
  SUN_LOUNGER_MODEL,
};

export const OUTDOOR_PATIO_MODELS: readonly ModelSpec[] = [
  PATIO_TABLE_MODEL,
  PATIO_CHAIR_MODEL,
  SUN_LOUNGER_MODEL,
  PARASOL_MODEL,
  OUTDOOR_SOFA_MODEL,
  BARBECUE_GRILL_MODEL,
];
