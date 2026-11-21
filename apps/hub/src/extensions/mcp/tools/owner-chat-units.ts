import type { RepairWorkComponent } from '@smarteverything/domain';
import { storeUnit } from '../../../store/host/unit';
import { saveRepairWorkClaim } from '../../../store/repositories/repair-work-claims';

export interface RepairWorkClaimInput {
  readonly component: RepairWorkComponent;
  readonly chatId: string;
  readonly profileId: string;
  readonly now: string;
}

export const REPAIR_WORK_CLAIM_UNIT = storeUnit((store, input: RepairWorkClaimInput) =>
  saveRepairWorkClaim(
    store.settingsKv,
    { component: input.component, chatId: input.chatId, profileId: input.profileId },
    new Date(input.now),
  ),
);
