import { mkdir, readFile } from 'node:fs/promises';
import type { PhotoFaceDevice } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import type { PhotoFaceRow } from '../../store/repositories/photo-faces';
import { cosine } from '../../vision/cluster';
import type { DetectedFace } from '../../vision/faces/engine';
import type { FaceImage } from '../../vision/faces/protocol';
import { sceneFrames } from '../../vision/faces/source';
import { vaapiDevice } from '../../media/ffmpeg-path';
import { rgbOnGpu } from '../pipeline/vaapi-decode';
import { FACE_MATCH_THRESHOLD } from '../../vision/models';
import { derivedPath } from '../pipeline/derived-paths';
import type { JobHandler } from '../pipeline/jobs';
import { FACE_MODEL_ID } from './defaults';
import { sourceOf, type AiEnvironment, type MediaItem } from './env';
import { float32Bytes } from './vectors';

export interface FaceDetector {
  readonly analyse: (image: FaceImage, signal?: AbortSignal) => Promise<DetectedFace[]>;
  readonly device: () => PhotoFaceDevice;
  readonly capacity: () => number;
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
  readonly resource = 'accelerator';

  constructor(
    private readonly env: AiEnvironment,
    private readonly detector: FaceDetector,
    private readonly touched: (profileId: string) => void,
  ) {}

  capacity(): number {
    return this.detector.capacity();
  }

  async run(job: DriveMediaJob, signal: AbortSignal): Promise<void> {
    const source = await sourceOf(this.env, job);
    if (source?.switches.faceGrouping !== true) return;
    const { item, subject } = source;
    const detected: DetectedFace[] = [];
    for (const frame of await this.frames(item, signal))
      detected.push(...(await this.detector.analyse(frame, signal)));
    const faces = item.kind === 'video' ? distinctFaces(detected) : detected;
    if (await this.record(item, subject, faces))
      this.env.log.debug('faces.detected', { itemId: item.id, faces: faces.length });
  }

  fail(job: DriveMediaJob, cause: unknown): Promise<void> {
    this.env.log.warn('faces.failed', { itemId: job.item_id, reason: messageOf(cause) });
    return Promise.resolve();
  }

  private async frames(item: MediaItem, signal: AbortSignal): Promise<FaceImage[]> {
    if (item.kind === 'image' && vaapiDevice() !== null) {
      const decoded = await rgbOnGpu(
        { path: await this.env.locate(item), mime: item.mime, name: item.name },
        signal,
      );
      if ('data' in decoded) return [{ kind: 'rgb', ...decoded }];
      this.env.log.info('faces.decoded_on_cpu', { itemId: item.id, reason: decoded.declined });
    }
    const poster = await readFile(
      derivedPath(this.env.layout, { itemId: item.id, rev: item.rev, size: 'preview' }),
    );
    if (item.kind === 'image') return [{ kind: 'encoded', bytes: poster }];
    await mkdir(this.env.layout.tmp, { recursive: true });
    const scenes = await sceneFrames(await this.env.locate(item), this.env.layout.tmp, signal);
    return [poster, ...scenes].map((frame) => ({ kind: 'encoded', bytes: frame }));
  }

  private async record(
    item: MediaItem,
    subject: string,
    faces: readonly DetectedFace[],
  ): Promise<boolean> {
    const recorded = await this.env.host.write('photoFacesSave', {
      itemId: item.id,
      rev: item.rev,
      subject,
      kind: 'person',
      faces: faces.map((face) => this.rowOf(item, face)),
    });
    if (recorded) this.touched(subject);
    return recorded;
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
