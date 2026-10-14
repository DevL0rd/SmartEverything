import type {
  DshWriterClaim,
  DshSessionMetadata,
  HarnessSubscriptionUse,
} from '@smarteverything/domain';
import type { NativeSessionPersistencePort } from '../persistence/port';
export interface HarnessControlPersistence extends NativeSessionPersistencePort {
  bind(claim: DshWriterClaim): void;
  claim(id: string): DshWriterClaim;
  boundClaim(id: string): DshWriterClaim | undefined;
  metadata(id: string, signal?: AbortSignal): Promise<DshSessionMetadata>;
  verify(claim: DshWriterClaim, subscription?: HarnessSubscriptionUse): Promise<DshWriterClaim>;
  lose(id: string): void;
}
