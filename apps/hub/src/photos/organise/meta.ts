import { ApiError, type PhotoDateEdit, type PhotoMetaPatch } from '@smarteverything/domain';
import type { StoreHost } from '../../store/host/host';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { PlaceRecords } from '../places-records';
import type { PhotoMetaOverrideWrite } from '../../store/repositories/photo-meta-overrides';
import type { DriveActor } from '../../drive/access';
import {
  announceItems,
  visibleItems,
  type AnnounceStore,
  type ItemsChanged,
  type VisibleItem,
} from './items';

export type MetaStore = AnnounceStore & Pick<HostStore, 'context' | 'write' | 'photoMetaOverrides'>;

interface Moment {
  readonly takenAt: string;
  readonly tzOffsetMin: number | null;
}

const MINUTE_MS = 60_000;

const OFFSET = /([+-])(\d{2}):?(\d{2})$/u;

function offsetOf(text: string): number {
  const match = OFFSET.exec(text);
  if (match === null) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function isoOf(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8.64e15) {
    throw new ApiError('invalid_request', 'The new date is outside the dates a photo can have.');
  }
  return new Date(milliseconds).toISOString();
}

function momentOf(item: VisibleItem, edit: PhotoDateEdit): Moment {
  if (edit.kind === 'set') {
    return { takenAt: isoOf(Date.parse(edit.takenAt)), tzOffsetMin: offsetOf(edit.takenAt) };
  }
  if (item.takenAt === null) {
    throw new ApiError(
      'invalid_request',
      'A photo without a date cannot be shifted; set its date.',
    );
  }
  return {
    takenAt: isoOf(Date.parse(item.takenAt) + edit.minutes * MINUTE_MS),
    tzOffsetMin: item.tzOffsetMin,
  };
}

type Kept = ReturnType<MetaStore['photoMetaOverrides']['find']>;

type Identity = Pick<PhotoMetaOverrideWrite, 'itemId' | 'setBy'>;

const NO_DATE = { takenAt: null, tzOffsetMin: null } as const;

const NO_PLACE = {
  latitude: null,
  longitude: null,
  placeLabel: null,
  locationCleared: false,
} as const;

function dateOf(
  kept: Kept,
  moment: Moment | undefined,
): Pick<PhotoMetaOverrideWrite, 'takenAt' | 'tzOffsetMin'> {
  if (moment !== undefined) return { takenAt: moment.takenAt, tzOffsetMin: moment.tzOffsetMin };
  return kept === undefined ? NO_DATE : { takenAt: kept.takenAt, tzOffsetMin: kept.tzOffsetMin };
}

function placeOf(
  kept: Kept,
  location: PhotoMetaPatch['location'],
): Pick<PhotoMetaOverrideWrite, 'latitude' | 'longitude' | 'placeLabel' | 'locationCleared'> {
  if (location === undefined) {
    return kept === undefined
      ? NO_PLACE
      : {
          latitude: kept.latitude,
          longitude: kept.longitude,
          placeLabel: kept.placeLabel,
          locationCleared: kept.locationCleared,
        };
  }
  return location === null
    ? { ...NO_PLACE, locationCleared: true }
    : {
        latitude: location.latitude,
        longitude: location.longitude,
        placeLabel: location.label,
        locationCleared: false,
      };
}

function merged(
  kept: Kept,
  identity: Identity,
  moment: Moment | undefined,
  location: PhotoMetaPatch['location'],
): PhotoMetaOverrideWrite {
  return { ...identity, ...dateOf(kept, moment), ...placeOf(kept, location) };
}

export class MetaWriter {
  constructor(private readonly store: MetaStore) {}

  edit(actor: DriveActor, patch: PhotoMetaPatch): ItemsChanged {
    return this.store.write(() => {
      const items = visibleItems(this.store.context, actor, patch.itemIds);
      if (items.some((item) => !item.own)) {
        throw new ApiError(
          'forbidden',
          'Only photos in your own drive or the shared drive can change their date or location.',
        );
      }
      const moments = items.map((item) => this.change(actor, item, patch));
      announceItems(this.store, items, moments);
      return { count: items.length };
    });
  }

  private change(actor: DriveActor, item: VisibleItem, patch: PhotoMetaPatch): string | null {
    const moment = patch.date === undefined ? undefined : momentOf(item, patch.date);
    this.remember(actor, item, patch, moment);
    if (moment !== undefined) this.applyDate(item.id, moment);
    if (patch.location !== undefined) this.applyLocation(item.id, patch.location);
    return moment?.takenAt ?? null;
  }

  private remember(
    actor: DriveActor,
    item: VisibleItem,
    patch: PhotoMetaPatch,
    moment: Moment | undefined,
  ): void {
    const { photoMetaOverrides } = this.store;
    const next = merged(
      photoMetaOverrides.find(item.id),
      { itemId: item.id, setBy: actor.profileId },
      moment,
      patch.location,
    );
    if (next.takenAt === null && next.latitude === null && !next.locationCleared) {
      photoMetaOverrides.remove([item.id]);
    } else {
      photoMetaOverrides.set(next);
    }
  }

  private applyDate(itemId: string, moment: Moment): void {
    const { sql } = this.store.context;
    sql.run(
      'apply the edited date to the photo',
      'update drive_items set taken_at = $takenAt where id = $itemId',
      {
        itemId,
        takenAt: moment.takenAt,
      },
    );
    sql.run(
      'record the edited date source and offset',
      `update drive_media set time_source = 'manual', tz_offset_min = $offset where item_id = $itemId`,
      { itemId, offset: moment.tzOffsetMin },
    );
  }

  private applyLocation(itemId: string, location: PhotoMetaPatch['location']): void {
    const { sql } = this.store.context;
    sql.run(
      'apply the edited location to the photo',
      'update drive_items set place_lat = $latitude, place_lon = $longitude where id = $itemId',
      { itemId, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null },
    );
    sql.run(
      'clear the place of the edited location so it is found again',
      'update drive_media set place_id = null where item_id = $itemId',
      { itemId },
    );
  }
}

export const PHOTO_META_EDIT_UNIT = storeUnit(
  (
    store,
    input: { readonly actor: DriveActor; readonly patch: PhotoMetaPatch; readonly placed: boolean },
  ) =>
    store.write(() => {
      const changed = new MetaWriter(store).edit(input.actor, input.patch);
      if (input.placed && input.patch.location !== undefined) {
        const places = new PlaceRecords(store.context);
        for (const itemId of input.patch.itemIds) places.assign(itemId);
      }
      return changed;
    }),
);

export class MetaEditor {
  constructor(
    private readonly host: StoreHost,
    private readonly placed: boolean,
  ) {}

  edit(actor: DriveActor, patch: PhotoMetaPatch): Promise<ItemsChanged> {
    return this.host.write('photoMetaEdit', { actor, patch, placed: this.placed });
  }
}
