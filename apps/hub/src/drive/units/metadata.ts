import type { DriveItem } from '@smarteverything/domain';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { DriveItemsRepository } from '../../store/repositories/drive-items';
import type { PhotoDescriptionsRepository } from '../../store/repositories/photo-descriptions';
import { PhotoDeviceZonesRepository } from '../../store/repositories/photo-device-zones';
import type { PhotoMetaOverridesRepository } from '../../store/repositories/photo-meta-overrides';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { overrideFacts } from '../../photos/organise/override';
import type { MediaFacts, Moment } from '../metadata-read';
import {
  inZone,
  isZoneless,
  zonePicker,
  type DeviceZones,
  type LocalZone,
  type ZonePicker,
} from '../metadata-zone';
import { modifiedIso } from './hash';

type MediaItem = Extract<DriveItem, { readonly kind: 'image' | 'video' | 'audio' }>;

export interface MetadataCandidate {
  readonly id: string;
  readonly relPath: string;
  readonly dev: string;
  readonly ino: string;
}

export interface MetadataReading {
  readonly facts: MediaFacts;
  readonly bytes: number;
  readonly modifiedMs: number;
}

export interface MetadataParts {
  readonly items: Pick<DriveItemsRepository, 'find' | 'identityOf' | 'write' | 'lookups'>;
  readonly descriptions: Pick<PhotoDescriptionsRepository, 'fromFile' | 'pending'>;
  readonly overrides: Pick<PhotoMetaOverridesRepository, 'find'>;
  readonly media: Pick<DriveMediaRepository, 'find' | 'save' | 'update'>;
  readonly deviceZones: DeviceZones;
}

export interface MetadataRecordInput {
  readonly candidate: MetadataCandidate;
  readonly reading: MetadataReading;
  readonly hubZone: string;
}

export interface MetadataRecorded {
  readonly recorded: boolean;
  readonly zone: LocalZone | null;
}

export function collectUnread(
  items: Pick<DriveItemsRepository, 'lookups'>,
  rootId: string,
): readonly MetadataCandidate[] {
  return items.lookups
    .unreadMedia(rootId)
    .map(({ id, relPath, dev, ino }): MetadataCandidate => ({ id, relPath, dev, ino }));
}

export function collectPending(
  parts: Pick<MetadataParts, 'items' | 'descriptions'>,
  rootId: string,
): readonly MetadataCandidate[] {
  const unread = collectUnread(parts.items, rootId);
  const known = new Set(unread.map((candidate) => candidate.id));
  const described = parts.descriptions
    .pending(rootId)
    .filter((candidate) => !known.has(candidate.id));
  return [...unread, ...described];
}

function isMedia(item: DriveItem): item is MediaItem {
  return item.kind === 'image' || item.kind === 'video' || item.kind === 'audio';
}

function visualOf(
  facts: MediaFacts,
): Pick<MediaFacts, 'width' | 'height' | 'orientation' | 'camera' | 'exposure' | 'place'> {
  return {
    width: facts.width,
    height: facts.height,
    orientation: facts.orientation,
    camera: facts.camera,
    exposure: facts.exposure,
    place: facts.place,
  };
}

function itemWith(item: MediaItem, facts: MediaFacts): MediaItem {
  const takenAt = facts.takenAt?.iso ?? item.modifiedAt;
  switch (item.kind) {
    case 'image':
      return { ...item, takenAt, ...visualOf(facts) };
    case 'video':
      return { ...item, takenAt, ...visualOf(facts), durationMs: facts.durationMs };
    case 'audio':
      return { ...item, takenAt, durationMs: facts.durationMs };
  }
}

function mediaRowFor(
  itemId: string,
  moment: Pick<Moment, 'offsetMin'> & { readonly source: Moment['source'] | 'manual' },
): Parameters<MetadataParts['media']['save']>[0] {
  return {
    item_id: itemId,
    time_source: moment.source,
    tz_offset_min: moment.offsetMin,
    preview_state: 'none',
    preview_reason: null,
    poster_state: 'none',
    poster_reason: null,
    playable_state: 'none',
    playable_reason: null,
    motion_clip_id: null,
    live_id: null,
    burst_id: null,
    stem_key: null,
    stack_id: null,
    place_id: null,
  };
}

function keepTime(
  parts: MetadataParts,
  itemId: string,
  moment: Moment | null,
  edited: boolean,
): void {
  const base = moment ?? { offsetMin: null, source: 'modified' as const };
  const time = edited ? { ...base, source: 'manual' as const } : base;
  if (parts.media.find(itemId) === undefined) {
    parts.media.save(mediaRowFor(itemId, time));
    return;
  }
  parts.media.update(itemId, { time_source: time.source, tz_offset_min: time.offsetMin });
}

function zonedFacts(
  zones: ZonePicker,
  itemId: string,
  facts: MediaFacts,
): { readonly facts: MediaFacts; readonly zone: LocalZone | null } {
  if (!isZoneless(facts.takenAt)) return { facts, zone: null };
  const zone = zones.pick(itemId, facts);
  return { facts: { ...facts, takenAt: inZone(facts.takenAt, zone) }, zone };
}

export function recordMetadata(parts: MetadataParts, input: MetadataRecordInput): MetadataRecorded {
  const { candidate, reading } = input;
  const current = parts.items.find(candidate.id, null);
  if (
    current === undefined ||
    !isMedia(current) ||
    current.bytes !== reading.bytes ||
    current.modifiedAt !== modifiedIso(reading.modifiedMs)
  ) {
    return { recorded: false, zone: null };
  }
  parts.descriptions.fromFile(current.id, reading.facts.description);
  if (current.takenAt !== null) return { recorded: true, zone: null };
  const identity = parts.items.identityOf(current.id);
  if (identity === null) return { recorded: false, zone: null };
  const zones = zonePicker(parts.deviceZones, () => input.hubZone);
  const override = parts.overrides.find(candidate.id);
  const { facts: zoned, zone } = zonedFacts(zones, candidate.id, reading.facts);
  const facts = overrideFacts(zoned, override);
  zones.keep(current.id, reading.facts);
  const written = parts.items.write({ item: itemWith(current, facts), identity }).item;
  if (written.kind !== 'audio') {
    keepTime(parts, written.id, facts.takenAt, override !== undefined && override.takenAt !== null);
  }
  return { recorded: true, zone };
}

function partsOf(store: HostStore): MetadataParts {
  return {
    items: store.driveItems,
    descriptions: store.photoDescriptions,
    overrides: store.photoMetaOverrides,
    media: new DriveMediaRepository(store.context),
    deviceZones: new PhotoDeviceZonesRepository(store.context),
  };
}

export const DRIVE_METADATA_PENDING_UNIT = storeUnit((store, input: { readonly rootId: string }) =>
  collectPending(partsOf(store), input.rootId),
);

export const DRIVE_METADATA_RECORD_UNIT = storeUnit((store, input: MetadataRecordInput) =>
  recordMetadata(partsOf(store), input),
);
