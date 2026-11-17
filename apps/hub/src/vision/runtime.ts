import { messageOf } from '@smarteverything/logging';
import {
  addon as openVino,
  type CompiledModel,
  type Core,
  type InferRequest,
  type Tensor,
} from 'openvino-node';
import type { FaceModelBytes } from './models';

export type FaceDeviceName = 'GPU' | 'CPU';

export interface FaceDevice {
  readonly name: FaceDeviceName;
  readonly reason: string;
}

export interface CompiledFaceModels {
  readonly device: FaceDevice;
  readonly detector: CompiledModel;
  readonly recognizer: CompiledModel;
}

const GPU = 'GPU';

export class FaceRuntimeError extends Error {
  override readonly name = 'FaceRuntimeError';
}

async function compileOn(
  core: Core,
  models: FaceModelBytes,
  device: FaceDeviceName,
  threads: number,
): Promise<Omit<CompiledFaceModels, 'device'>> {
  const shared = {
    INFERENCE_PRECISION_HINT: 'f32',
    PERFORMANCE_HINT: 'THROUGHPUT',
    ALLOW_AUTO_BATCHING: 'NO',
  };
  const config = device === 'CPU' ? { ...shared, INFERENCE_NUM_THREADS: threads } : shared;
  const [detector, recognizer] = await Promise.all(
    [models.detector, models.recognizer].map(async (bytes) =>
      core.compileModel(await core.readModel(bytes), device, config),
    ),
  );
  if (detector === undefined || recognizer === undefined)
    throw new FaceRuntimeError('OpenVINO did not compile both face models.');
  return { detector, recognizer };
}

export function tensorOf(shape: readonly number[], data: Float32Array): Tensor {
  const tensor = new openVino.Tensor('f32', [...shape]);
  tensor.data = data;
  return tensor;
}

export class InferPool {
  readonly size: number;
  private readonly free: InferRequest[];
  private readonly waiting: ((request: InferRequest) => void)[] = [];

  constructor(compiled: CompiledModel, what: string) {
    const optimal = Number(compiled.getProperty('OPTIMAL_NUMBER_OF_INFER_REQUESTS'));
    if (!Number.isInteger(optimal) || optimal < 1)
      throw new FaceRuntimeError(`OpenVINO gave no request count for the ${what}.`);
    this.size = optimal;
    this.free = Array.from({ length: optimal }, () => compiled.createInferRequest());
  }

  async run<T>(inputs: Tensor[], read: (request: InferRequest) => T): Promise<T> {
    const request = await this.acquire();
    try {
      await request.inferAsync(inputs);
      return read(request);
    } finally {
      this.release(request);
    }
  }

  private acquire(): Promise<InferRequest> {
    const request = this.free.pop();
    if (request !== undefined) return Promise.resolve(request);
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  private release(request: InferRequest): void {
    const next = this.waiting.shift();
    if (next === undefined) this.free.push(request);
    else next(request);
  }
}

export async function compileFaceModels(
  models: FaceModelBytes,
  threads: number,
): Promise<CompiledFaceModels> {
  const core = new openVino.Core();
  const devices = core.getAvailableDevices();
  if (!devices.some((device) => device.startsWith(GPU))) {
    const reason = `OpenVINO found no GPU (devices: ${devices.join(', ')}); the GPU needs the Intel compute runtime.`;
    return { device: { name: 'CPU', reason }, ...(await compileOn(core, models, 'CPU', threads)) };
  }
  const gpuName = String(core.getProperty(GPU, 'FULL_DEVICE_NAME'));
  try {
    const compiled = await compileOn(core, models, 'GPU', threads);
    return { device: { name: 'GPU', reason: `OpenVINO runs on ${gpuName}.` }, ...compiled };
  } catch (cause) {
    const reason = `${gpuName} could not compile the face models: ${messageOf(cause)}`;
    return { device: { name: 'CPU', reason }, ...(await compileOn(core, models, 'CPU', threads)) };
  }
}
