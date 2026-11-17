import { z } from 'zod';
import { FACE_EMBEDDING_SIZE } from '../models';

const FRACTION = z.number().min(0).max(1);

const BYTES = z.custom<Uint8Array>((value) => value instanceof Uint8Array);

export const FACE_INIT = z.strictObject({
  directory: z.string().min(1),
  threads: z.int().positive(),
});

export type FaceInit = z.infer<typeof FACE_INIT>;

export const FACE_IMAGE = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('rgb'),
    width: z.int().positive(),
    height: z.int().positive(),
    data: BYTES,
  }),
  z.strictObject({ kind: z.literal('encoded'), bytes: BYTES }),
]);

export type FaceImage = z.infer<typeof FACE_IMAGE>;

export const FACE_REQUEST = z.strictObject({
  id: z.int().nonnegative(),
  image: FACE_IMAGE,
});

export type FaceRequest = z.infer<typeof FACE_REQUEST>;

const POINT = z.strictObject({ x: FRACTION, y: FRACTION });

export const FACE_WIRE = z.strictObject({
  box: z.strictObject({ x: FRACTION, y: FRACTION, w: FRACTION, h: FRACTION }),
  landmarks: z.tuple([POINT, POINT, POINT, POINT, POINT]).readonly(),
  score: FRACTION,
  quality: FRACTION,
  embedding: z
    .instanceof(Float32Array)
    .refine((vector) => vector.length === FACE_EMBEDDING_SIZE, 'a face embedding has 128 values'),
});

export const FACE_REPLY = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('ready'),
    device: z.enum(['GPU', 'CPU']),
    reason: z.string(),
    requests: z.int().positive(),
  }),
  z.strictObject({
    kind: z.literal('faces'),
    id: z.int().nonnegative(),
    faces: z.array(FACE_WIRE),
  }),
  z.strictObject({
    kind: z.literal('failed'),
    id: z.int().nonnegative().nullable(),
    message: z.string(),
  }),
]);

export type FaceReply = z.infer<typeof FACE_REPLY>;
