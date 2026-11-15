import { mkdir, readFile } from 'node:fs/promises';
import { messageOf } from '@smarteverything/logging';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import type { PhotoFaceRow } from '../../store/repositories/photo-faces';
import { cosine } from '../../vision/cluster';
import type { DetectedFace } from '../../vision/faces/engine';
import type { RgbImage } from '../../vision/faces/image';
import { rgbOf, sceneFrames } from '../../vision/faces/source';
import { FACE_MATCH_THRESHOLD } from '../../vision/models';
import { derivedPath } from '../pipeline/derived-paths';
import type { JobHandler } from '../pipeline/jobs';
import { FACE_MODEL_ID } from './defaults';
import { currentItem, type AiEnvironment, type MediaItem } from './env';
import { float32Bytes } from './vectors';

export interface FaceDetector {
  readonly analyse: (image: RgbImage, signal?: AbortSignal) => Promise<DetectedFace[]>;
}

export function distinctFaces(faces: readonly DetectedFace[]): DetectedFace[] {
  const kept: DetectedFace[] = [];
  for (const face of faces.toSorted((a, b) => b.quality - a.quality)) {
    const same = kept.some(
      (other) => cosine(face.embedding, other.embedding) >= FACE_MATCH_THRESHOLD,
    );
    if (!same) kept.push(face);
  }
  return kept;
}

export class FacesHandler implements JobHandler {
  readonly resource = 'cpu';

  constructor(
    private readonly env: AiEnvironment,
    private readonly detector: FaceDetector,
    private readonly touched: (profileId: string) => void,
  ) {}

  async run(job: DriveMediaJob, signal: AbortSignal): Promise<void> {
    const item = currentItem(this.env, job);
    if (item === undefined) return;
    const subject = this.env.consent.subjectOfRoot(item.rootId);
    if (!this.env.consent.faceGrouping(subject)) return;
    const detected: DetectedFace[] = [];
    for (const frame of await this.frames(item, signal))
      detected.push(...(await this.detector.analyse(await rgbOf(frame), signal)));
    const faces = item.kind === 'video' ? distinctFaces(detected) : detected;
    if (this.record(job, item, subject, faces))
      this.env.log.debug('faces.detected', { itemId: item.id, faces: faces.length });
  }

  fail(job: DriveMediaJob, cause: unknown): void {
    this.env.log.warn('faces.failed', { itemId: job.item_id, reason: messageOf(cause) });
  }

  private async frames(item: MediaItem, signal: AbortSignal): Promise<Buffer[]> {
    const poster = await readFile(
      derivedPath(this.env.layout, { itemId: item.id, rev: item.rev, size: 'preview' }),
    );
    if (item.kind === 'image') return [poster];
    await mkdir(this.env.layout.tmp, { recursive: true });
    const scenes = await sceneFrames(await this.env.locate(item), this.env.layout.tmp, signal);
    return [poster, ...scenes];
  }

  private record(
    job: DriveMediaJob,
    item: MediaItem,
    subject: string,
    faces: readonly DetectedFace[],
  ): boolean {
    return this.env.store.write(() => {
      const now = this.env.store.driveItems.find(item.id, null);
      if (now?.rev !== job.rev || !this.env.consent.faceGrouping(subject)) return false;
      this.env.store.photoFaces.replaceKindForItem(
        item.id,
        'person',
        faces.map((face) => this.rowOf(item, face)),
      );
      this.touched(subject);
      return true;
    });
  }

  private rowOf(item: MediaItem, face: DetectedFace): PhotoFaceRow {
    return {
      id: this.env.newId(),
      itemId: item.id,
      rev: item.rev,
      kind: 'person',
      species: null,
      box: face.box,
      landmarks: face.landmarks,
      score: face.score,
      quality: face.quality,
      model: FACE_MODEL_ID,
      vector: float32Bytes(face.embedding),
    };
  }
}
