import {
  DEVICE_CAPABILITY,
  JSON_VALUE,
  PROVIDER,
  type CapabilityKey,
  type CommandRow,
  type CommandStatus,
  type DeviceCapability,
  type EventKind,
  type JsonValue,
  type Provider,
  type ProviderLinkRow,
  type ProviderPrompt,
} from '@smarteverything/domain';
import { z } from 'zod';

export type { CommandRow };

export const DEVICE_RECORD = z
  .object({
    id: z.uuid(),
    provider: PROVIDER,
    external_id: z.string().min(1),
    parent_id: z.uuid().nullable(),
    kind: z.string().min(1),
    online: z.boolean(),
    room_id: z.uuid().nullable(),
    capabilities: z.array(DEVICE_CAPABILITY),
    details: z.record(z.string(), JSON_VALUE),
  })
  .transform((row) => ({
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    parentId: row.parent_id,
    kind: row.kind,
    online: row.online,
    roomId: row.room_id,
    capabilities: row.capabilities,
    details: row.details,
  }));

export type DeviceRecord = z.infer<typeof DEVICE_RECORD>;

export interface DeviceUpsert {
  readonly provider: Provider;
  readonly externalId: string;
  readonly parentId: string | null;
  readonly kind: string;
  readonly name: string;
  readonly model: string;
  readonly manufacturer: string;
  readonly providerRoom: string | null;
  readonly roomId: string | null;
  readonly online: boolean;
  readonly capabilities: readonly DeviceCapability[];
  readonly details: Readonly<Record<string, JsonValue>>;
}

export interface StateRecord {
  readonly deviceId: string;
  readonly capability: CapabilityKey;
  readonly value: JsonValue;
  readonly observedAt: string;
}

export interface EventInsert {
  readonly deviceId: string | null;
  readonly kind: EventKind;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, JsonValue>>;
}

export interface CameraUpsert {
  readonly deviceId: string;
  readonly streamName: string;
  readonly sourceUrlKind: string;
  readonly physicalPtz: boolean;
  readonly twoWayAudio: boolean;
}

export interface CameraRecord {
  readonly deviceId: string;
  readonly recordEvents: boolean;
}

export interface ProviderLinkChange {
  readonly status?: ProviderLinkRow['status'];
  readonly accountLabel?: string | null;
  readonly prompt?: ProviderPrompt | null;
  readonly phase?: ProviderLinkRow['phase'];
  readonly problem?: ProviderLinkRow['problem'];
  readonly lastError?: string | null;
  readonly deviceCount?: number;
}

export interface HomeRecord {
  readonly timeZone: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface AutomationRecord {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: unknown;
  readonly runCount: number;
  readonly lastError: string | null;
}

export interface SceneRecord {
  readonly id: string;
  readonly actions: unknown;
}

export interface AutomationChange {
  readonly lastRunAt?: string;
  readonly runCount?: number;
  readonly lastError: string | null;
}

export interface CommandInsert {
  readonly deviceId: string;
  readonly capability: CapabilityKey;
  readonly value: JsonValue;
  readonly source: 'automation' | 'scene';
}

export type CommandOutcome =
  | { readonly status: 'succeeded'; readonly result: JsonValue }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'expired' };

export interface RecordingFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface RecordingInsert {
  readonly deviceId: string;
  readonly eventId: string | null;
  readonly kind: 'snapshot' | 'clip';
  readonly storagePath: string;
  readonly startedAt: string;
  readonly durationMs: number | null;
  readonly bytes: number;
}

export interface HubDatabase {
  readonly pendingCommands: () => Promise<readonly CommandRow[]>;
  readonly claimCommand: (id: string, from: CommandStatus) => Promise<boolean>;
  readonly finishCommand: (id: string, outcome: CommandOutcome) => Promise<void>;
  readonly insertCommands: (rows: readonly CommandInsert[]) => Promise<readonly CommandRow[]>;
  readonly loadDevices: () => Promise<readonly DeviceRecord[]>;
  readonly upsertDevices: (rows: readonly DeviceUpsert[]) => Promise<readonly DeviceRecord[]>;
  readonly setDevicesOnline: (
    ids: readonly string[],
    online: boolean,
  ) => Promise<readonly DeviceRecord[]>;
  readonly removeDevices: (ids: readonly string[]) => Promise<void>;
  readonly ensureRooms: (names: readonly string[]) => Promise<ReadonlyMap<string, string>>;
  readonly loadState: () => Promise<readonly StateRecord[]>;
  readonly upsertState: (rows: readonly StateRecord[]) => Promise<void>;
  readonly insertEvents: (rows: readonly EventInsert[]) => Promise<readonly string[]>;
  readonly enrichEvent: (id: string, details: Readonly<Record<string, JsonValue>>) => Promise<void>;
  readonly loadCameras: () => Promise<readonly CameraRecord[]>;
  readonly upsertCameras: (rows: readonly CameraUpsert[]) => Promise<void>;
  readonly updateProviderLink: (provider: Provider, change: ProviderLinkChange) => Promise<void>;
  readonly loadHome: () => Promise<HomeRecord>;
  readonly loadAutomations: () => Promise<readonly AutomationRecord[]>;
  readonly loadScenes: () => Promise<readonly SceneRecord[]>;
  readonly updateAutomation: (id: string, change: AutomationChange) => Promise<void>;
  readonly storeRecording: (file: RecordingFile, row: RecordingInsert) => Promise<void>;
}
