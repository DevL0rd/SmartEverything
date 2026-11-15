import { parentPort, workerData } from 'node:worker_threads';
import { messageOf } from '@smarteverything/logging';
import { readFaceModels } from '../models';
import { onnxRuntime } from '../runtime';
import { FaceEngine } from './engine';
import { FACE_INIT, FACE_REQUEST, type FaceReply } from './protocol';

const init = FACE_INIT.parse(workerData);

function send(reply: FaceReply): void {
  parentPort?.postMessage(reply);
}

const engine = readFaceModels(init.directory).then((models) =>
  FaceEngine.load(onnxRuntime(init.threads), models),
);

engine.then(
  () => {
    send({ kind: 'ready' });
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
  const { id, width, height, data } = parsed.data;
  engine
    .then((loaded) => loaded.analyse({ width, height, data }))
    .then(
      (faces) => {
        send({ kind: 'faces', id, faces });
      },
      (cause: unknown) => {
        send({ kind: 'failed', id, message: messageOf(cause) });
      },
    );
});
