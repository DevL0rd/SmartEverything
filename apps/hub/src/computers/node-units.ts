import { ApiError, type NodeHello } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import { computerExternalId, describeComputer } from './computer-device';

export interface NodeClaim {
  readonly codeHash: string;
  readonly hello: NodeHello;
  readonly windowTokenHash: string | null;
  readonly tokenHash: string;
}

export interface NodeClaimed {
  readonly deviceId: string;
  readonly hubUrl: string;
}

type ClaimStore = Pick<HostStore, 'clients' | 'computerAi' | 'computerNodes' | 'devices'>;

function windowClientOf(
  store: ClaimStore,
  windowTokenHash: string | null,
  createdBy: string,
): string | null {
  if (windowTokenHash === null) return null;
  const client = store.clients.byTokenHash(windowTokenHash);
  if (client?.id !== createdBy || client.role !== 'owner' || client.platform !== 'desktop') {
    throw new ApiError('forbidden', 'Pair this computer from the owner’s enrolled desktop.');
  }
  return client.id;
}

function computerDevice(store: ClaimStore, hello: NodeHello): string {
  const known = store.devices
    .list()
    .find(
      (device) =>
        device.provider === 'local' && device.external_id === computerExternalId(hello.machineId),
    );
  if (known !== undefined) return known.id;
  const discovered = describeComputer(hello, [], { power: [], machine: [] });
  const row = store.devices.upsert([
    { ...discovered, parentId: null, providerRoom: null, roomId: null, online: false },
  ])[0];
  if (row === undefined)
    throw new ApiError('internal', 'The paired computer device was not persisted.');
  return row.id;
}

export function claimNode(store: ClaimStore, claim: NodeClaim): NodeClaimed | null {
  return store.computerNodes.claim(claim.codeHash, (hubUrl, createdBy) => {
    const windowClientId = windowClientOf(store, claim.windowTokenHash, createdBy);
    const deviceId = computerDevice(store, claim.hello);
    store.computerNodes.bind({
      deviceId,
      machineId: claim.hello.machineId,
      tokenHash: claim.tokenHash,
      hubUrl,
      windowClientId,
      profileId: store.clients.find(createdBy)?.profile_id ?? null,
    });
    store.computerAi.saveSettings(deviceId, store.computerAi.settings(deviceId));
    return { deviceId, hubUrl };
  });
}

export const COMPUTER_NODE_CLAIM_UNIT = storeUnit(claimNode);
