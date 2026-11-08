import type { Clock } from '../../clock';
import type { EffectHandlers } from '../engine-v3-effects';
import type { HubEffectPorts } from '../hub-effects';
import type { IntegrationPorts } from '../integration-effects';
import { applianceEffects } from './appliance-nodes';
import { callEffects } from './call-nodes';
import { cameraCaptureEffects, type ClipIssuer } from './camera-capture';
import { cameraEffects } from './camera-nodes';
import { climateEffects } from './climate-nodes';
import { computerNodeEffects } from './computer-nodes';
import { conversationEffects } from './conversation-nodes';
import type { DeviceSetter } from './device-set';
import { driveEffects, type DriveEffectPorts } from './drive-nodes';
import { healthEffects } from './health-nodes';
import { imageEffects, type AutomationImagesSlot } from './image-nodes';
import { irEffects } from './ir-nodes';
import { laundryEffects } from './laundry-nodes';
import { lightEffects } from './light-nodes';
import { phoneEffects } from './phone-nodes';
import { plannerEffects } from '../../planner/automation-effects';
import { securityEffects } from './security-nodes';
import { tvEffects } from './tv-nodes';
import { vacuumEffects } from './vacuum-nodes';

export interface CoreNodeEffectPorts extends HubEffectPorts {
  readonly integration: IntegrationPorts;
  readonly images: AutomationImagesSlot;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly setter: Pick<DeviceSetter, 'set' | 'setTogether'>;
  readonly issuer: ClipIssuer;
  readonly drive: DriveEffectPorts['drive'];
}

export function coreNodeEffects(ports: CoreNodeEffectPorts): EffectHandlers {
  return {
    ...lightEffects(ports),
    ...climateEffects(ports),
    ...driveEffects({
      drive: ports.drive,
      ownerProfileId: () => ports.integration.ownerProfileId(),
    }),
    ...applianceEffects(ports),
    ...securityEffects(ports),
    ...vacuumEffects(ports),
    ...tvEffects(ports),
    ...cameraEffects(ports),
    ...cameraCaptureEffects({
      store: ports.store,
      clock: ports.clock,
      issuer: ports.issuer,
      pictures: { take: (deviceId, size) => ports.integration.pictures.take(deviceId, size) },
    }),
    ...callEffects(ports),
    ...computerNodeEffects(ports),
    ...conversationEffects(ports),
    ...healthEffects(ports),
    ...imageEffects(ports),
    ...irEffects(ports),
    ...laundryEffects(ports),
    ...plannerEffects({ store: ports.store, clock: ports.clock, integration: ports.integration }),
    ...phoneEffects({
      store: ports.store,
      tools: {
        check: (...args) => ports.integration.tools.check(...args),
        call: (...args) => ports.integration.tools.call(...args),
      },
      ownerProfileId: () => ports.integration.ownerProfileId(),
    }),
  };
}
