import {
  PrinterError,
  type PrinterJob,
  type PrinterPrintOptions,
  type PrinterSource,
} from '@smarteverything/domain';
import { OPERATION } from '@smarteverything/ipp';
import type { Logger } from '@smarteverything/logging';
import type { ToolCaller } from '../contract';
import { jobView, mayControl, requireOwner } from './access';
import { featuresOf } from './device';
import {
  loadSource,
  plan,
  resolveOptions,
  sendAsSplit,
  submissionOf,
  validate,
  type LoadedDocument,
  type PrintPorts,
} from './print';
import { RateGuard, type CapName } from './rate-guard';
import { prefsOf } from './records';
import type { PrinterSession } from './session';
import { testPagePng } from './test-page';

export interface PrintResult {
  readonly job: PrinterJob | null;
  readonly format: string;
  readonly converted: boolean;
}

export interface ActionDeps {
  readonly ports: PrintPorts;
  readonly now: () => Date;
  readonly log: Logger;
}

interface Submission {
  readonly document: LoadedDocument;
  readonly name: string;
  readonly options: PrinterPrintOptions;
}

type Refusable = number;

function requiredId(id: number | null): number {
  if (id === null) throw new PrinterError('not_authorized', 'That job has no printer id.');
  return id;
}

function requiredModel(session: PrinterSession): NonNullable<PrinterSession['model']> {
  const { model } = session;
  if (model === null)
    throw new PrinterError('unreachable', `${session.name} has not been read yet.`);
  return model;
}

function mediaFor(session: PrinterSession, options: PrinterPrintOptions): string {
  const { description } = session;
  const media =
    options.media ??
    description.defaults.media ??
    session.model?.status.mediaReady[0] ??
    description.capabilities.media[0];
  if (media === undefined) {
    throw new PrinterError(
      'format_unsupported',
      `${session.name} did not say which paper it takes.`,
    );
  }
  return media;
}

export class SessionActions {
  readonly #guards = new Map<string, RateGuard>();

  constructor(private readonly deps: ActionDeps) {}

  #allow(session: PrinterSession, caller: ToolCaller, cap: CapName): void {
    const guard = this.#guards.get(session.record.uuid) ?? new RateGuard(this.deps.log);
    this.#guards.set(session.record.uuid, guard);
    if (!guard.allow(cap, caller.profileId)) {
      throw new PrinterError(
        'rate_limited',
        'That is too many printer actions in a minute; wait a moment.',
      );
    }
  }

  async #run<T>(session: PrinterSession, operation: Refusable, work: () => Promise<T>): Promise<T> {
    if (!session.online) throw new PrinterError('unreachable', `${session.name} is offline.`);
    try {
      return await work();
    } catch (cause) {
      if (cause instanceof PrinterError && cause.reason === 'not_authorized') {
        session.update({ disabledOps: [...new Set([...session.record.disabledOps, operation])] });
        session.refresh();
      }
      throw cause;
    }
  }

  async print(
    session: PrinterSession,
    caller: ToolCaller,
    input: {
      readonly source: PrinterSource;
      readonly name?: string | undefined;
      readonly options?: PrinterPrintOptions | undefined;
    },
  ): Promise<PrintResult> {
    this.#allow(session, caller, 'write');
    const document = await loadSource(this.deps.ports, caller, input.source);
    return this.#submit(session, caller, {
      document,
      name: input.name ?? document.name,
      options: input.options ?? {},
    });
  }

  async testPage(session: PrinterSession, caller: ToolCaller): Promise<PrintResult> {
    this.#allow(session, caller, 'write');
    const colour = session.description.capabilities.color === true;
    const stamp = this.deps.now().toISOString().slice(0, 16).replace('T', ' ');
    const data = await testPagePng(session.name, stamp, colour);
    return this.#submit(session, caller, {
      document: { data, name: 'Test page', kind: 'png' },
      name: 'Test page',
      options: {},
    });
  }

  #submit(session: PrinterSession, caller: ToolCaller, request: Submission): Promise<PrintResult> {
    const split = session.description.capabilities.operations.includes(OPERATION.createJob);
    return this.#run(session, split ? OPERATION.createJob : OPERATION.printJob, async () => {
      const { description } = session;
      const options = resolveOptions(
        description,
        prefsOf(session.record, caller.profileId),
        request.options,
      );
      const planned = await plan(this.deps.ports, {
        description,
        document: request.document,
        options,
        media: mediaFor(session, options),
      });
      const submission = submissionOf(request.name, planned.format, options);
      if (featuresOf(requiredModel(session)).validate) await validate(session.client, submission);
      const job = await session.client.submit(submission, planned.body, sendAsSplit(description));
      const record = session.observer.registerSubmitted(job, {
        person: caller.profileId,
        name: request.name,
        format: planned.format,
        copies: options.copies ?? null,
        colorMode: options.colorMode ?? null,
        sides: options.sides ?? null,
      });
      session.refresh();
      return {
        job: record === null ? null : jobView(record, caller),
        format: planned.format,
        converted: planned.converted,
      };
    });
  }

  async cancel(session: PrinterSession, caller: ToolCaller, key: string): Promise<void> {
    const record = session.ledger.job(key);
    if (record?.jobId === null || record === null) {
      throw new PrinterError('not_authorized', `${session.name} has no job ${key}.`);
    }
    if (!mayControl(record, caller)) {
      throw new PrinterError('not_authorized', 'You can cancel only your own print jobs.');
    }
    this.#allow(session, caller, 'write');
    await this.#run(session, OPERATION.cancelJob, () =>
      session.client.control(OPERATION.cancelJob, requiredId(record.jobId)),
    );
    session.refresh();
  }

  async cancelAll(session: PrinterSession, caller: ToolCaller): Promise<void> {
    requireOwner(caller, 'clear the whole print queue');
    this.#allow(session, caller, 'cancelAll');
    const operation = session.description.capabilities.operations.includes(OPERATION.cancelJobs)
      ? OPERATION.cancelJobs
      : OPERATION.purgeJobs;
    await this.#run(session, operation, () => session.client.printerControl(operation));
    session.refresh();
  }

  async hold(
    session: PrinterSession,
    caller: ToolCaller,
    key: string,
    release: boolean,
  ): Promise<void> {
    const record = session.ledger.job(key);
    if (record?.jobId === null || record === null) {
      throw new PrinterError('not_authorized', `${session.name} has no job ${key}.`);
    }
    if (!mayControl(record, caller)) {
      throw new PrinterError('not_authorized', 'You can hold or release only your own print jobs.');
    }
    this.#allow(session, caller, 'write');
    const operation = release ? OPERATION.releaseJob : OPERATION.holdJob;
    await this.#run(session, operation, () =>
      session.client.control(operation, requiredId(record.jobId)),
    );
    session.refresh();
  }

  async identify(
    session: PrinterSession,
    caller: ToolCaller,
    how: string | undefined,
  ): Promise<void> {
    this.#allow(session, caller, 'identify');
    const offered = session.description.capabilities.identifyActions;
    const actions = how !== undefined && offered.includes(how) ? [how] : offered.slice(0, 1);
    if (actions.length === 0) {
      throw new PrinterError('not_authorized', `${session.name} cannot identify itself.`);
    }
    await this.#run(session, OPERATION.identifyPrinter, () =>
      session.client.identify(actions, null),
    );
  }

  async pauseResume(session: PrinterSession, caller: ToolCaller, pause: boolean): Promise<void> {
    this.#allow(session, caller, 'write');
    const operation = pause ? OPERATION.pausePrinter : OPERATION.resumePrinter;
    await this.#run(session, operation, () => session.client.printerControl(operation));
    session.refresh();
  }
}
