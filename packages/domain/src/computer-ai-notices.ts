import { z } from 'zod';
import { CLAUDE_NOTICES } from './claude';
import { COMPUTER_AI_STATUS } from './computer-ai';

export const COMPUTER_AI_NOTICES = [
  z.strictObject({ type: z.literal('computer_ai_status'), status: COMPUTER_AI_STATUS }),
  z.strictObject({
    type: z.literal('computer_claude'),
    device_id: z.uuid(),
    notice: z.discriminatedUnion('type', CLAUDE_NOTICES),
  }),
] as const;
