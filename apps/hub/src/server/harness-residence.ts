import { ApiError } from '@smarteverything/domain';
import type { HubHarnessControl } from '@smarteverything/domain';
import type { ComputerNodeAccess } from '../computers/node-access';
import type { HarnessService } from '../harness/service';
import { RemoteHarness } from './harness-remote';

export const RECONNECT_GRACE_MS = 60_000;

export interface ResidenceLink {
  readonly token: string | null;
  send(frame: HubHarnessControl): void;
  terminate(): void;
}

interface Waiter {
  readonly resolve: () => void;
  readonly reject: (cause: unknown) => void;
}

interface ResidenceBinding {
  readonly device_id: string;
  readonly generation: string;
  readonly runtime_instance: string;
}

export class HarnessResidence {
  readonly remote: RemoteHarness;
  private link: ResidenceLink | null = null;
  private grace: NodeJS.Timeout | undefined;
  private ended = false;
  private readonly waiting = new Set<Waiter>();

  constructor(
    service: HarnessService,
    readonly binding: ResidenceBinding,
    private readonly access: Pick<ComputerNodeAccess, 'authenticate'>,
    private readonly gone: () => void,
  ) {
    this.remote = new RemoteHarness(service, binding, {
      send: (control): void => {
        this.send(control);
      },
      terminate: (): void => {
        this.link?.terminate();
      },
      authenticate: (): void => {
        this.access.authenticate(this.attachedLink().token);
      },
    });
  }

  get attached(): boolean {
    return this.link !== null;
  }

  attach(link: ResidenceLink): void {
    if (this.ended) throw new ApiError('conflict', 'This computer runtime has already ended.');
    clearTimeout(this.grace);
    this.link = link;
    for (const waiter of this.waiting) waiter.resolve();
    this.waiting.clear();
  }

  detach(link: ResidenceLink): void {
    if (this.link !== link || this.ended) return;
    this.link = null;
    this.grace = setTimeout(() => {
      this.end();
    }, RECONNECT_GRACE_MS);
    this.grace.unref();
  }

  send(control: HubHarnessControl): void {
    this.attachedLink().send(control);
  }

  async execute(
    ...input: Parameters<RemoteHarness['execute']>
  ): ReturnType<RemoteHarness['execute']> {
    await this.untilAttached();
    return this.remote.execute(...input);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.grace);
    for (const waiter of this.waiting)
      waiter.reject(
        new ApiError('conflict', 'The computer did not reconnect; its work was not delivered.'),
      );
    this.waiting.clear();
    this.remote.stop();
    this.gone();
  }

  private attachedLink(): ResidenceLink {
    if (this.link === null)
      throw new ApiError('conflict', 'The computer is reconnecting; try again in a moment.');
    return this.link;
  }

  private untilAttached(): Promise<void> {
    if (this.link !== null) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.waiting.add({ resolve, reject });
    });
  }
}
