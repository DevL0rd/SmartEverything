import {
  createServer as createHttp,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttps } from 'node:https';
import { generate } from 'selfsigned';
import {
  OPERATION,
  STATUS,
  GROUP_TAG,
  attribute,
  decodeMessage,
  encodeMessage,
  ipp,
  plainObject,
  type IppGroup,
  type IppMessage,
} from '@smarteverything/ipp';
import { printerAttributes } from './fake-ipp-attributes';
import {
  DEFAULT_OPERATIONS,
  freshState,
  jobGroup,
  type FakeJob,
  type FakeOptions,
  type FakeState,
  type Seen,
} from './fake-ipp-state';

export { DEFAULT_OPERATIONS } from './fake-ipp-state';

type Operation = Readonly<Record<string, unknown>>;

export class FakeIppPrinter {
  readonly state: FakeState = freshState();
  readonly seen: Seen[] = [];
  readonly documents: Uint8Array[] = [];
  busy = false;
  malformed = false;
  slow = false;
  failStatus: number | null = null;
  #server: Server | null = null;
  #port = 0;
  #notifications: ServerResponse[] = [];
  #sequence = 0;
  certificateFingerprint = '';

  constructor(readonly options: FakeOptions = {}) {}

  get url(): string {
    const scheme = this.options.secure === true ? 'ipps' : 'ipp';
    return `${scheme}://127.0.0.1:${String(this.#port)}${this.options.path ?? '/ipp/print'}`;
  }

  get port(): number {
    return this.#port;
  }

  async start(): Promise<void> {
    const handler = (request: IncomingMessage, response: ServerResponse): void => {
      this.#handle(request, response);
    };
    if (this.options.secure === true) {
      const pems = await generate([{ name: 'commonName', value: 'fake-printer' }], {
        keySize: 2048,
      });
      this.#server = createHttps({ key: pems.private, cert: pems.cert }, handler);
    } else {
      this.#server = createHttp(handler);
    }
    await new Promise<void>((resolve) => {
      this.#server?.listen(this.options.port ?? 0, '127.0.0.1', resolve);
    });
    const address = this.#server.address();
    this.#port = typeof address === 'object' && address !== null ? address.port : 0;
  }

  async stop(): Promise<void> {
    for (const response of this.#notifications) response.destroy();
    this.#server?.closeAllConnections();
    await new Promise<void>((resolve) => {
      this.#server?.close(() => {
        resolve();
      });
    });
  }

  pushEvent(events: readonly string[]): void {
    this.#sequence += 1;
    const message = this.#reply(STATUS.ok, [
      {
        tag: GROUP_TAG.eventNotification,
        attributes: [
          attribute('notify-sequence-number', ipp.integer(this.#sequence)),
          attribute('notify-subscribed-event', ...events.map((event) => ipp.keyword(event))),
          attribute('printer-state', ipp.enumeration(this.state.state)),
        ],
      },
    ]);
    const body = Buffer.from(encodeMessage(message));
    for (const response of this.#notifications.splice(0)) {
      response.setHeader('Content-Type', 'application/ipp');
      response.end(body);
    }
  }

  #handle(request: IncomingMessage, response: ServerResponse): void {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      this.#answer(request, response, Buffer.concat(chunks));
    });
  }

  #refuse(request: IncomingMessage, response: ServerResponse): boolean {
    const { auth } = this.options;
    if (auth !== undefined && auth !== null) {
      const expected = `Basic ${Buffer.from(`${auth.user}:${auth.password}`).toString('base64')}`;
      if (request.headers.authorization !== expected) {
        response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="printer"' });
        response.end();
        return true;
      }
    }
    if (request.url !== (this.options.path ?? '/ipp/print')) {
      response.writeHead(404);
      response.end();
      return true;
    }
    if (this.malformed) {
      response.writeHead(200, { 'Content-Type': 'application/ipp' });
      response.end(Buffer.from([1, 1, 0]));
      return true;
    }
    return false;
  }

  #answer(request: IncomingMessage, response: ServerResponse, body: Buffer): void {
    if (this.#refuse(request, response)) return;
    const message = decodeMessage(body);
    const operation = plainObject(message.groups[0]?.attributes ?? []);
    this.seen.push({
      operation: message.code,
      attributes: operation,
      dataLength: message.data.length,
    });
    if (message.data.length > 0) this.documents.push(message.data);
    if (this.busy) {
      this.#send(response, this.#reply(STATUS.busy, []));
      return;
    }
    if (message.code === OPERATION.getNotifications && this.options.subscriptions === true) {
      this.#notifications.push(response);
      return;
    }
    setTimeout(
      () => {
        this.#send(response, this.#dispatch(message, operation));
      },
      this.slow ? 400 : 0,
    );
  }

  #send(response: ServerResponse, message: IppMessage): void {
    response.writeHead(200, { 'Content-Type': 'application/ipp' });
    response.end(Buffer.from(encodeMessage(message)));
  }

  #reply(status: number, groups: readonly IppGroup[]): IppMessage {
    return {
      major: 2,
      minor: 0,
      code: status,
      requestId: 1,
      groups: [
        {
          tag: GROUP_TAG.operation,
          attributes: [
            attribute('attributes-charset', ipp.charset('utf-8')),
            attribute('attributes-natural-language', ipp.language('en')),
          ],
        },
        ...groups,
      ],
      data: new Uint8Array(0),
    };
  }

  #dispatch(message: IppMessage, operation: Operation): IppMessage {
    const supported = this.options.operations ?? DEFAULT_OPERATIONS;
    const allowed =
      supported.includes(message.code) || message.code === OPERATION.getPrinterAttributes;
    if (!allowed) return this.#reply(STATUS.operationNotSupported, []);
    if (this.failStatus !== null) return this.#reply(this.failStatus, []);
    return this.#route(message.code, operation);
  }

  readonly #handlers = new Map<number, (operation: Operation) => IppMessage>([
    [OPERATION.getPrinterAttributes, this.#attributes.bind(this)],
    [OPERATION.getJobs, this.#jobs.bind(this)],
    [OPERATION.getJobAttributes, this.#jobAttributes.bind(this)],
    [OPERATION.printJob, this.#created.bind(this)],
    [OPERATION.createJob, this.#created.bind(this)],
    [OPERATION.createPrinterSubscriptions, this.#subscription.bind(this)],
    [OPERATION.cancelJob, this.#setState.bind(this, 7)],
    [OPERATION.holdJob, this.#setState.bind(this, 4)],
    [OPERATION.releaseJob, this.#setState.bind(this, 3)],
    [OPERATION.pausePrinter, this.#pause.bind(this, true)],
    [OPERATION.resumePrinter, this.#pause.bind(this, false)],
  ]);

  #route(code: number, operation: Operation): IppMessage {
    return this.#handlers.get(code)?.(operation) ?? this.#reply(STATUS.ok, []);
  }

  #attributes(operation: Operation): IppMessage {
    return this.#reply(STATUS.ok, [
      {
        tag: GROUP_TAG.printer,
        attributes: printerAttributes(this.state, this.options, this.url, operation),
      },
    ]);
  }

  #jobs(operation: Operation): IppMessage {
    const completed = operation['which-jobs'] === 'completed';
    return this.#reply(
      STATUS.ok,
      this.state.jobs.filter((job) => job.state >= 7 === completed).map(jobGroup),
    );
  }

  #created(operation: Operation): IppMessage {
    return this.#reply(STATUS.ok, [jobGroup(this.#addJob(operation))]);
  }

  #subscription(_operation: Operation): IppMessage {
    if (this.options.subscriptions !== true) return this.#reply(STATUS.operationNotSupported, []);
    return this.#reply(STATUS.ok, [
      {
        tag: GROUP_TAG.subscription,
        attributes: [
          attribute('notify-subscription-id', ipp.integer(5)),
          attribute('notify-lease-duration', ipp.integer(3600)),
        ],
      },
    ]);
  }

  #pause(paused: boolean, _operation: Operation): IppMessage {
    const others = this.state.reasons.filter((reason) => reason !== 'paused');
    this.state.reasons = paused ? [...others, 'paused'] : others;
    return this.#reply(STATUS.ok, []);
  }

  #jobAttributes(operation: Operation): IppMessage {
    const job = this.state.jobs.find((entry) => entry.id === operation['job-id']);
    return job === undefined
      ? this.#reply(STATUS.notFound, [])
      : this.#reply(STATUS.ok, [jobGroup(job)]);
  }

  #setState(next: number, operation: Operation): IppMessage {
    const index = this.state.jobs.findIndex((entry) => entry.id === operation['job-id']);
    const job = this.state.jobs[index];
    if (job === undefined) return this.#reply(STATUS.notFound, []);
    this.state.jobs[index] = { ...job, state: next };
    return this.#reply(STATUS.ok, []);
  }

  #addJob(operation: Readonly<Record<string, unknown>>): FakeJob {
    const job: FakeJob = {
      id: this.state.jobs.length + 1,
      name: typeof operation['job-name'] === 'string' ? operation['job-name'] : 'job',
      user:
        typeof operation['requesting-user-name'] === 'string'
          ? operation['requesting-user-name']
          : 'user',
      state: 3,
      impressions: 1,
      done: 0,
      createdAt: this.state.upTime,
    };
    this.state.jobs.push(job);
    return job;
  }
}
