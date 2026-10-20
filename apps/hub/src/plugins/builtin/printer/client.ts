import {
  OPERATION,
  STATUS,
  MINIMAL_ATTRIBUTES,
  JOB_ATTRIBUTES,
  cancelSubscription,
  createJob,
  createSubscription,
  encodeMessage,
  getJobs,
  getNotifications,
  getPrinterAttributes,
  identifyPrinter,
  jobOperation,
  parseResponse,
  printJob,
  printerOperation,
  readDescription,
  readGrant,
  readJob,
  readJobs,
  readStatus,
  renewSubscription,
  requireSuccess,
  sendDocument,
  statusName,
  validateJob,
  type IppMessage,
  type IppResponse,
  type JobsQuery,
  type Link,
  type PrinterDescription,
  type PrinterJob,
  type PlainObject,
  type PrinterStatus,
  type Submission,
  type SubscriptionGrant,
  NOTIFY_EVENTS,
} from '@smarteverything/ipp';
import { PrinterError } from '@smarteverything/domain';
import type { Credentials } from './http-auth';
import { IppTransport, LONG_POLL_TIMEOUT_MS, type HttpReply, type PostOptions } from './transport';
import type { PrinterAddress } from './address';
import { notificationOf, type Notification } from './notification';

const USER_NAME = 'smarteverything';
const NEUTRAL_USER = 'user';
const FIRST_VERSION = { major: 2, minor: 0 } as const;
const LEASE_SECONDS = 3600;

export interface ClientOptions {
  readonly address: PrinterAddress;
  readonly pin: string | null;
  readonly credentials: Credentials | null;
  readonly transport?: Pick<IppTransport, 'post'>;
}

export interface DescribedPrinter {
  readonly description: PrinterDescription;
  readonly raw: PlainObject;
}

function failureOf(reply: HttpReply, operation: number): PrinterError | null {
  const where = `HTTP ${String(reply.status)} for ${String(operation)}`;
  if (reply.status === 401)
    return new PrinterError('not_authenticated', 'The printer asks for a user name and password.');
  if (reply.status === 403)
    return new PrinterError('not_authorized', 'The printer refused this account.');
  if (reply.status === 404)
    return new PrinterError(
      'wrong_path',
      `The printer has no IPP service at this path (${where}).`,
    );
  if (reply.status === 426)
    return new PrinterError('needs_tls', 'The printer only talks over ipps.');
  if (reply.status === 503) return new PrinterError('busy', 'The printer is busy.');
  if (reply.status < 200 || reply.status >= 300)
    return new PrinterError('not_ipp', `The address answered with ${where}, not IPP.`);
  return reply.contentType.toLowerCase().startsWith('application/ipp')
    ? null
    : new PrinterError(
        'not_ipp',
        `The address answered with ${reply.contentType || 'no content type'}, not application/ipp.`,
      );
}

function reasonOf(status: number): PrinterError | null {
  switch (status) {
    case STATUS.notAuthenticated:
      return new PrinterError(
        'not_authenticated',
        'The printer asks for a user name and password.',
      );
    case STATUS.notAuthorized:
    case STATUS.forbidden:
      return new PrinterError(
        'not_authorized',
        `The printer refused this operation (${statusName(status)}).`,
      );
    case STATUS.busy:
    case STATUS.serviceUnavailable:
    case STATUS.temporaryError:
      return new PrinterError('busy', `The printer is busy (${statusName(status)}).`);
    case STATUS.documentFormatNotSupported:
      return new PrinterError(
        'format_unsupported',
        'The printer does not accept this document format.',
      );
    default:
      return null;
  }
}

export class PrinterClient {
  #requestId = 0;
  #version: { major: number; minor: number } = { ...FIRST_VERSION };
  #user = USER_NAME;
  #pending = 0;
  #tail: Promise<unknown> = Promise.resolve();
  readonly #transport: Pick<IppTransport, 'post'>;

  constructor(private readonly options: ClientOptions) {
    this.#transport =
      options.transport ??
      new IppTransport({
        url: options.address.url,
        pin: options.pin,
        credentials: options.credentials,
      });
  }

  get uri(): string {
    return this.options.address.uri;
  }

  get inFlight(): boolean {
    return this.#pending > 0;
  }

  #link(): Link {
    this.#requestId += 1;
    return {
      printerUri: this.options.address.uri,
      user: this.#user,
      requestId: this.#requestId,
      version: this.#version,
    };
  }

  async #roundTrip(
    build: (link: Link) => IppMessage,
    options: PostOptions = {},
  ): Promise<IppResponse> {
    const message = build(this.#link());
    const reply = await this.#transport.post(encodeMessage(message), options);
    const problem = failureOf(reply, message.code);
    if (problem !== null) throw problem;
    return parseResponse(reply.body);
  }

  async #call(build: (link: Link) => IppMessage, options: PostOptions = {}): Promise<IppResponse> {
    let response = await this.#roundTrip(build, options);
    if (response.status === STATUS.versionNotSupported) {
      this.#version = { major: 1, minor: 1 };
      response = await this.#roundTrip(build, options);
    }
    if (response.status === STATUS.badRequest && this.#user !== NEUTRAL_USER) {
      this.#user = NEUTRAL_USER;
      response = await this.#roundTrip(build, options);
    }
    const reason = reasonOf(response.status);
    if (reason !== null) throw reason;
    return response;
  }

  #exclusive<T>(work: () => Promise<T>): Promise<T> {
    this.#pending += 1;
    const run = this.#tail.then(async () => {
      try {
        return await work();
      } finally {
        this.#pending -= 1;
      }
    });
    this.#tail = Promise.allSettled([run]);
    return run;
  }

  async pollStatus(): Promise<PrinterStatus | null> {
    return this.inFlight ? null : this.status();
  }

  describe(): Promise<DescribedPrinter> {
    return this.#exclusive(async () => {
      const response = await this.#call((link) => getPrinterAttributes(link, ['all']));
      requireSuccess(OPERATION.getPrinterAttributes, response);
      const raw = response.printer[0] ?? {};
      return { description: readDescription(raw), raw };
    });
  }

  status(): Promise<PrinterStatus> {
    return this.#exclusive(async () => {
      const response = await this.#call((link) => getPrinterAttributes(link, MINIMAL_ATTRIBUTES));
      requireSuccess(OPERATION.getPrinterAttributes, response);
      return readStatus(response.printer[0] ?? {});
    });
  }

  async attributesFor(format: string): Promise<PrinterDescription> {
    return this.#exclusive(async () => {
      const response = await this.#call((link) => getPrinterAttributes(link, ['all'], format));
      requireSuccess(OPERATION.getPrinterAttributes, response);
      return readDescription(response.printer[0] ?? {});
    });
  }

  jobs(query: Omit<JobsQuery, 'requested'>): Promise<readonly PrinterJob[]> {
    return this.#exclusive(async () => {
      const response = await this.#call((link) =>
        getJobs(link, { ...query, requested: JOB_ATTRIBUTES }),
      );
      requireSuccess(OPERATION.getJobs, response);
      return readJobs(response.jobs);
    });
  }

  job(jobId: number): Promise<PrinterJob | null> {
    return this.#exclusive(async () => {
      const response = await this.#call((link) =>
        jobOperation(link, OPERATION.getJobAttributes, jobId),
      );
      requireSuccess(OPERATION.getJobAttributes, response);
      const [group] = response.jobs;
      return group === undefined ? null : readJob(group);
    });
  }

  control(
    operation: typeof OPERATION.cancelJob | typeof OPERATION.holdJob | typeof OPERATION.releaseJob,
    jobId: number,
  ): Promise<void> {
    return this.#exclusive(async () => {
      requireSuccess(operation, await this.#call((link) => jobOperation(link, operation, jobId)));
    });
  }

  printerControl(
    operation:
      | typeof OPERATION.pausePrinter
      | typeof OPERATION.resumePrinter
      | typeof OPERATION.purgeJobs
      | typeof OPERATION.cancelJobs
      | typeof OPERATION.cancelMyJobs,
  ): Promise<void> {
    return this.#exclusive(async () => {
      requireSuccess(operation, await this.#call((link) => printerOperation(link, operation)));
    });
  }

  identify(actions: readonly string[], message: string | null): Promise<void> {
    return this.#exclusive(async () => {
      requireSuccess(
        OPERATION.identifyPrinter,
        await this.#call((link) => identifyPrinter(link, actions, message)),
      );
    });
  }

  validate(submission: Submission): Promise<IppResponse> {
    return this.#exclusive(() => this.#call((link) => validateJob(link, submission)));
  }

  submit(submission: Submission, data: Uint8Array, split: boolean): Promise<PrinterJob | null> {
    return this.#exclusive(async () => {
      if (!split) {
        const response = await this.#call((link) => printJob(link, submission, data), {
          readTimeoutMs: SUBMIT_TIMEOUT_MS,
        });
        requireSuccess(OPERATION.printJob, response);
        return jobFrom(response);
      }
      const created = await this.#call((link) => createJob(link, submission));
      requireSuccess(OPERATION.createJob, created);
      const job = jobFrom(created);
      const jobId = job?.id;
      if (jobId === undefined) return null;
      const document = { jobId, format: submission.documentFormat, name: submission.jobName };
      requireSuccess(
        OPERATION.sendDocument,
        await this.#call((link) => sendDocument(link, document, data), {
          readTimeoutMs: SUBMIT_TIMEOUT_MS,
        }),
      );
      return job;
    });
  }

  subscribe(): Promise<SubscriptionGrant | null> {
    return this.#exclusive(async () => {
      const response = await this.#call((link) =>
        createSubscription(link, { events: NOTIFY_EVENTS, leaseSeconds: LEASE_SECONDS }),
      );
      requireSuccess(OPERATION.createPrinterSubscriptions, response);
      const [group] = response.subscriptions;
      return group === undefined ? null : readGrant(group);
    });
  }

  renew(subscriptionId: number): Promise<void> {
    return this.#exclusive(async () => {
      requireSuccess(
        OPERATION.renewSubscription,
        await this.#call((link) => renewSubscription(link, subscriptionId, LEASE_SECONDS)),
      );
    });
  }

  unsubscribe(subscriptionId: number): Promise<void> {
    return this.#exclusive(async () => {
      await this.#call((link) => cancelSubscription(link, subscriptionId));
    });
  }

  async notifications(
    subscriptionId: number,
    after: number | null,
    signal: AbortSignal,
  ): Promise<Notification> {
    const message = getNotifications(this.#link(), { subscriptionId, after });
    const reply = await this.#transport.post(encodeMessage(message), {
      readTimeoutMs: LONG_POLL_TIMEOUT_MS,
      signal,
    });
    const problem = failureOf(reply, message.code);
    if (problem !== null && !reply.contentType.toLowerCase().startsWith('multipart/'))
      throw problem;
    return notificationOf(reply);
  }
}

const SUBMIT_TIMEOUT_MS = 120_000;

function jobFrom(response: IppResponse): PrinterJob | null {
  const [group] = response.jobs;
  return group === undefined ? null : readJob(group);
}
