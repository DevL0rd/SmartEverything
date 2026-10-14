import { fork, type ChildProcess } from 'node:child_process';
import { arch, platform } from 'node:process';
import { ImageOperationError } from './errors';
import {
  RASTER_REQUEST,
  type RasterRequest,
  type RasterResult,
  type RasterReply,
} from './raster-protocol';
import { rasterRuntime, rasterRuntimeIssue } from './raster-runtime';
import { RASTER_REPLY_WIRE, rasterRequestWire } from './raster-wire';

const RASTER_TIMEOUT_MS = 30_000;
const RASTER_PROCESSES_MAX = 4;
let active = 0;
let problem: string | null = null;
type Outcome = { readonly result: RasterResult | null } | { readonly error: ImageOperationError };
interface Completion {
  readonly resolve: (result: RasterResult | null) => void;
  readonly reject: (error: ImageOperationError) => void;
}
class RasterProcess {
  private outcome: Outcome | null = null;
  private ready = false;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly aborted: () => void;
  constructor(
    private readonly child: ChildProcess,
    private readonly request: RasterRequest,
    private readonly completion: Completion,
    private readonly signal: AbortSignal | undefined,
  ) {
    this.timer = setTimeout(() => {
      this.fail('The image raster process exceeded its time limit.');
    }, RASTER_TIMEOUT_MS);
    this.aborted = (): void => {
      this.finish({
        error: new ImageOperationError('cancelled', 'Image raster processing was cancelled.'),
      });
    };
    child.on('error', () => {
      this.fail('The plain Node image raster process could not start.');
    });
    child.on('message', (value: unknown) => {
      this.received(value);
    });
    child.once('close', () => {
      this.closed();
    });
    signal?.addEventListener('abort', this.aborted, { once: true });
    if (signal?.aborted === true) this.aborted();
  }
  private received(value: unknown): void {
    if (this.outcome !== null) return;
    const parsed = RASTER_REPLY_WIRE.safeParse(value);
    if (!parsed.success) {
      this.fail('The image raster process returned invalid data.');
      return;
    }
    if (parsed.data.kind === 'ready') this.handshake(parsed.data);
    else this.completed(parsed.data);
  }
  private handshake(reply: Extract<RasterReply, { kind: 'ready' }>): void {
    if (this.ready || reply.platform !== platform || reply.arch !== arch) {
      this.fail('The image raster process runtime does not match this host.');
      return;
    }
    this.ready = true;
    problem = null;
    if (this.request.kind === 'probe') {
      this.finish({ result: null });
      return;
    }
    this.child.send(rasterRequestWire(this.request), (error) => {
      if (error instanceof Error) this.fail('The image raster request could not be delivered.');
    });
  }
  private completed(reply: Exclude<RasterReply, { kind: 'ready' }>): void {
    if (!this.ready) {
      this.fail('The image raster process did not validate its runtime.');
      return;
    }
    if (reply.kind === 'error') {
      const detail =
        reply.code === 'limit'
          ? 'Image raster dimensions, animation or preview exceed the supported limit.'
          : 'Image content failed raster decoding.';
      this.finish({ error: new ImageOperationError(reply.code, detail) });
      return;
    }
    if (
      (this.request.kind === 'validate' && reply.kind !== 'validated') ||
      (this.request.kind === 'preview' && reply.kind !== 'preview')
    ) {
      this.fail('The image raster process returned an unexpected result.');
      return;
    }
    this.finish({ result: reply });
  }
  private fail(detail: string): void {
    if (!this.ready) problem = detail;
    this.finish({ error: new ImageOperationError('unknown', detail) });
  }
  private finish(outcome: Outcome): void {
    if (this.outcome !== null) return;
    this.outcome = outcome;
    this.child.kill('SIGKILL');
  }
  private closed(): void {
    clearTimeout(this.timer);
    this.signal?.removeEventListener('abort', this.aborted);
    active -= 1;
    if (this.outcome === null) {
      const detail = 'The image raster process exited before returning a result.';
      if (!this.ready) problem = detail;
      this.outcome = { error: new ImageOperationError('unknown', detail) };
    }
    if ('error' in this.outcome) this.completion.reject(this.outcome.error);
    else this.completion.resolve(this.outcome.result);
  }
}
export function rasterIssue(): string | null {
  return rasterRuntimeIssue() ?? problem;
}
export function runRaster(
  request: RasterRequest,
  signal?: AbortSignal,
): Promise<RasterResult | null> {
  signal?.throwIfAborted();
  const parsed = RASTER_REQUEST.parse(request);
  const runtime = rasterRuntime();
  if (active >= RASTER_PROCESSES_MAX)
    throw new ImageOperationError('limit', 'The image raster process capacity is full.');
  const child = fork(runtime.entry, [], {
    execPath: runtime.executable,
    execArgv: [...runtime.execArgv],
    serialization: 'json',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: {},
  });
  active += 1;
  return new Promise((resolve, reject) => {
    new RasterProcess(child, parsed, { resolve, reject }, signal);
  });
}
export async function requireRasterRuntime(signal: AbortSignal): Promise<void> {
  await runRaster({ kind: 'probe' }, signal);
}
