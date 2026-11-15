import {
  PHOTO_BOX,
  PHOTO_GROUP_KINDS,
  PHOTO_POINT,
  type PhotoBox,
  type PhotoGroupKind,
  type PhotoPoint,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { inList, jsonText } from '../sql';

const COLUMNS = 'id, item_id, rev, kind, species, box, landmarks, score, quality, model, vector';

const FACE_COLUMNS = z.strictObject({
  id: z.string(),
  item_id: z.string(),
  rev: z.number(),
  kind: z.enum(PHOTO_GROUP_KINDS),
  species: z.string().nullable(),
  box: PHOTO_BOX,
  landmarks: z.array(PHOTO_POINT).nullable(),
  score: z.number(),
  quality: z.number(),
  model: z.string(),
  vector: z.instanceof(Uint8Array),
});

export interface PhotoFaceRow {
  readonly id: string;
  readonly itemId: string;
  readonly rev: number;
  readonly kind: PhotoGroupKind;
  readonly species: string | null;
  readonly box: PhotoBox;
  readonly landmarks: readonly PhotoPoint[] | null;
  readonly score: number;
  readonly quality: number;
  readonly model: string;
  readonly vector: Uint8Array;
}

const STORED_FACE = storedRow(
  FACE_COLUMNS.transform((row): PhotoFaceRow => ({
    id: row.id,
    itemId: row.item_id,
    rev: row.rev,
    kind: row.kind,
    species: row.species,
    box: row.box,
    landmarks: row.landmarks,
    score: row.score,
    quality: row.quality,
    model: row.model,
    vector: row.vector,
  })),
  { json: ['box', 'landmarks'] },
);

export class PhotoFacesRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): PhotoFaceRow | undefined {
    return this.context.sql.get(STORED_FACE, `select ${COLUMNS} from photo_faces where id = $id`, {
      id,
    });
  }

  byId(id: string): PhotoFaceRow {
    return found(this.find(id), 'photo face', id);
  }

  forItem(itemId: string): PhotoFaceRow[] {
    return this.context.sql.all(
      STORED_FACE,
      `select ${COLUMNS} from photo_faces where item_id = $itemId order by id`,
      { itemId },
    );
  }

  forItems(itemIds: readonly string[]): PhotoFaceRow[] {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.sql.all(
      STORED_FACE,
      `select ${COLUMNS} from photo_faces where ${filter.text} order by item_id, id`,
      filter.parameters,
    );
  }

  replaceForItem(itemId: string, faces: readonly PhotoFaceRow[]): void {
    this.context.write(() => {
      this.context.sql.run(
        'remove the detections of the photo',
        'delete from photo_faces where item_id = $itemId',
        { itemId },
      );
      for (const face of faces) this.insert(itemId, face);
    });
  }

  replaceKindForItem(itemId: string, kind: PhotoGroupKind, faces: readonly PhotoFaceRow[]): void {
    this.context.write(() => {
      this.context.sql.run(
        'remove the detections of one kind in the photo',
        'delete from photo_faces where item_id = $itemId and kind = $kind',
        { itemId, kind },
      );
      for (const face of faces) this.insert(itemId, face);
    });
  }

  removeKind(kind: PhotoGroupKind): number {
    return this.context.write(() =>
      this.context.sql.run(
        'remove the detections of one kind',
        'delete from photo_faces where kind = $kind',
        { kind },
      ),
    );
  }

  removeForItems(itemIds: readonly string[]): number {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.write(() =>
      this.context.sql.run(
        'remove the detections of the photos',
        `delete from photo_faces where ${filter.text}`,
        filter.parameters,
      ),
    );
  }

  private insert(itemId: string, face: PhotoFaceRow): void {
    this.context.sql.run(
      'save the detection of the photo',
      `insert into photo_faces (${COLUMNS})
        values ($id, $itemId, $rev, $kind, $species, $box, $landmarks, $score, $quality,
          $model, $vector)`,
      {
        id: face.id,
        itemId,
        rev: face.rev,
        kind: face.kind,
        species: face.species,
        box: jsonText(face.box),
        landmarks: face.landmarks === null ? null : jsonText(face.landmarks),
        score: face.score,
        quality: face.quality,
        model: face.model,
        vector: face.vector,
      },
    );
  }
}
