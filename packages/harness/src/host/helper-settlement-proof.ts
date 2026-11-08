import { z } from 'zod';
import { DSH_SESSION_ID } from '@smarteverything/domain';

export const HELPER_SETTLEMENT_PROOF = 'plugin:smarteverything/helper-settlement';
export const HELPER_SETTLEMENT_PROOF_DATA = z.strictObject({
  childSessionId: DSH_SESSION_ID,
  writerEpoch: z.int().positive(),
  nextSeq: z.int().nonnegative(),
});
type Proof = z.infer<typeof HELPER_SETTLEMENT_PROOF_DATA>;

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    'plugin:smarteverything/helper-settlement': Proof;
  }
}
