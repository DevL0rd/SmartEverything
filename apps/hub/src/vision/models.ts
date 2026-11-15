import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const FACE_DETECTOR_FILE = 'face_detection_yunet_2023mar.onnx';
export const FACE_RECOGNIZER_FILE = 'face_recognition_sface_2021dec.onnx';

export const FACE_MATCH_THRESHOLD = 0.363;
export const FACE_EMBEDDING_SIZE = 128;

const SHIPPED = new URL('vision/', import.meta.url);
const CHECKOUT = new URL('../../assets/vision/', import.meta.url);

export class VisionModelsMissingError extends Error {
  override readonly name = 'VisionModelsMissingError';

  constructor(readonly directory: string) {
    super(`The face models are not in ${directory}. Run pnpm run build:vision-models.`);
  }
}

export function visionAssetDirectory(): string {
  const found = [SHIPPED, CHECKOUT].find((candidate) => existsSync(candidate));
  return fileURLToPath(found ?? CHECKOUT);
}

export interface FaceModelBytes {
  readonly detector: Uint8Array;
  readonly recognizer: Uint8Array;
}

export async function readFaceModels(directory: string): Promise<FaceModelBytes> {
  const [detector, recognizer] = await Promise.all(
    [FACE_DETECTOR_FILE, FACE_RECOGNIZER_FILE].map(async (file) => {
      const path = `${directory}/${file}`;
      if (!existsSync(path)) throw new VisionModelsMissingError(directory);
      return new Uint8Array(await readFile(path));
    }),
  );
  if (detector === undefined || recognizer === undefined)
    throw new VisionModelsMissingError(directory);
  return { detector, recognizer };
}
