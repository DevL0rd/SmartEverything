import { parentPort, workerData } from 'node:worker_threads';
import { messageOf } from '@smarteverything/logging';
import { readFaceModels } from '../models';
import { FaceEngine } from './engine';
import { FACE_INIT, FACE_REQUEST, type FaceReply } from './protocol';
import { rgbOf } from './source';

const init = FACE_INIT.parse(workerData);

function send(reply: FaceReply): void {
  parentPort?.postMessage(reply);
}

const engine = readFaceModels(init.directory).then((models) =>
  FaceEngine.load(models, init.threads),
);

engine.then(
  (loaded) => {
    send({
      kind: 'ready',
      device: loaded.device.name,
      reason: loaded.device.reason,
      requests: loaded.requests,
    });
  },
  (cause: unknown) => {
    send({ kind: 'failed', id: null, message: messageOf(cause) });
  },
);

parentPort?.on('message', (raw: unknown) => {
  const parsed = FACE_REQUEST.safeParse(raw);
  if (!parsed.success) {
    send({
      kind: 'failed',
      id: null,
      message: 'The face worker received a request it cannot read.',
    });
    return;
  }
  const { id, image } = parsed.data;
  Promise.all([engine, image.kind === 'rgb' ? image : rgbOf(image.bytes)])
    .then(([loaded, rgb]) => loaded.analyse(rgb))
    .then(
      (faces) => {
        send({ kind: 'faces', id, faces });
      },
      (cause: unknown) => {
        send({ kind: 'failed', id, message: messageOf(cause) });
      },
    );
});
