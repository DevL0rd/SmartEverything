import type { FunctionV4 } from '../graph';

export interface StarterNode {
  readonly id: string;
  readonly name: string;
  readonly program: FunctionV4;
}

export const STARTER_NODE_IDS = {
  speakOrPush: '5eed0000-c057-4000-8000-000000000001',
  switchDevices: '5eed0000-c057-4000-8000-000000000002',
  lightsOffAfter: '5eed0000-c057-4000-8000-000000000003',
  flashTheLights: '5eed0000-c057-4000-8000-000000000004',
  wakeUpLight: '5eed0000-c057-4000-8000-000000000005',
  leaveHomeCheck: '5eed0000-c057-4000-8000-000000000006',
} as const;
