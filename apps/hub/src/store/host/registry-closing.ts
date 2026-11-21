import { DRIVE_USAGE_UNIT } from '../../drive/usage-unit';
import { REPAIR_WORK_CLAIM_UNIT } from '../../extensions/mcp/tools/owner-chat-units';
import { MODEL_READ_UNITS, MODEL_WRITE_UNITS } from '../../server/handlers/model-units';
import { AI_MODEL_FAVOURITES_UNIT } from '../../openrouter/model-suggestions';

export const CLOSING_READ_UNITS = {
  ...MODEL_READ_UNITS,
  driveUsage: DRIVE_USAGE_UNIT,
  aiModelFavourites: AI_MODEL_FAVOURITES_UNIT,
} as const;

export const CLOSING_WRITE_UNITS = {
  ...MODEL_WRITE_UNITS,
  repairWorkClaim: REPAIR_WORK_CLAIM_UNIT,
} as const;
