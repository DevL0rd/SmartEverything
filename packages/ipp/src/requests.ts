import type { IppAttribute, IppGroup, IppMessage } from './model';
import { OPERATION } from './ops';
import { GROUP_TAG } from './tags';
import { attribute, ipp, keywords } from './values';

export interface Link {
  readonly printerUri: string;
  readonly user: string;
  readonly requestId: number;
  readonly version: { readonly major: number; readonly minor: number };
}

const EMPTY = new Uint8Array(0);

export function request(
  link: Link,
  operation: number,
  parts: {
    readonly operationAttributes?: readonly IppAttribute[];
    readonly groups?: readonly IppGroup[];
    readonly data?: Uint8Array;
  } = {},
): IppMessage {
  const operationGroup: IppGroup = {
    tag: GROUP_TAG.operation,
    attributes: [
      attribute('attributes-charset', ipp.charset('utf-8')),
      attribute('attributes-natural-language', ipp.language('en')),
      attribute('printer-uri', ipp.uri(link.printerUri)),
      attribute('requesting-user-name', ipp.name(link.user)),
      ...(parts.operationAttributes ?? []),
    ],
  };
  return {
    major: link.version.major,
    minor: link.version.minor,
    code: operation,
    requestId: link.requestId,
    groups: [operationGroup, ...(parts.groups ?? [])],
    data: parts.data ?? EMPTY,
  };
}

function jobTarget(jobId: number): readonly IppAttribute[] {
  return [attribute('job-id', ipp.integer(jobId))];
}

export function getPrinterAttributes(
  link: Link,
  requested: readonly string[],
  documentFormat: string | null = null,
): IppMessage {
  return request(link, OPERATION.getPrinterAttributes, {
    operationAttributes: [
      ...(documentFormat === null
        ? []
        : [attribute('document-format', ipp.mimeType(documentFormat))]),
      keywords('requested-attributes', requested),
    ],
  });
}

export interface JobsQuery {
  readonly which: 'completed' | 'not-completed' | 'all';
  readonly limit: number;
  readonly requested: readonly string[];
  readonly mine: boolean;
}

export function getJobs(link: Link, query: JobsQuery): IppMessage {
  return request(link, OPERATION.getJobs, {
    operationAttributes: [
      attribute('which-jobs', ipp.keyword(query.which)),
      attribute('limit', ipp.integer(query.limit)),
      attribute('my-jobs', ipp.boolean(query.mine)),
      keywords('requested-attributes', query.requested),
    ],
  });
}

export function jobOperation(
  link: Link,
  operation:
    | typeof OPERATION.cancelJob
    | typeof OPERATION.holdJob
    | typeof OPERATION.releaseJob
    | typeof OPERATION.getJobAttributes
    | typeof OPERATION.closeJob,
  jobId: number,
): IppMessage {
  return request(link, operation, { operationAttributes: jobTarget(jobId) });
}

export function printerOperation(
  link: Link,
  operation:
    | typeof OPERATION.pausePrinter
    | typeof OPERATION.resumePrinter
    | typeof OPERATION.purgeJobs
    | typeof OPERATION.cancelJobs
    | typeof OPERATION.cancelMyJobs,
): IppMessage {
  return request(link, operation);
}

export function identifyPrinter(
  link: Link,
  actions: readonly string[],
  message: string | null,
): IppMessage {
  return request(link, OPERATION.identifyPrinter, {
    operationAttributes: [
      keywords('identify-actions', actions),
      ...(message === null ? [] : [attribute('message', ipp.text(message))]),
    ],
  });
}

export interface Submission {
  readonly jobName: string;
  readonly documentFormat: string;
  readonly template: readonly IppAttribute[];
  readonly fidelity: boolean;
}

function submissionAttributes(
  submission: Submission,
  withFormat: boolean,
): readonly IppAttribute[] {
  return [
    attribute('job-name', ipp.name(submission.jobName)),
    attribute('ipp-attribute-fidelity', ipp.boolean(submission.fidelity)),
    ...(withFormat ? [attribute('document-format', ipp.mimeType(submission.documentFormat))] : []),
  ];
}

function jobGroup(submission: Submission): IppGroup {
  return { tag: GROUP_TAG.job, attributes: submission.template };
}

export function validateJob(link: Link, submission: Submission): IppMessage {
  return request(link, OPERATION.validateJob, {
    operationAttributes: submissionAttributes(submission, true),
    groups: [jobGroup(submission)],
  });
}

export function printJob(link: Link, submission: Submission, data: Uint8Array): IppMessage {
  return request(link, OPERATION.printJob, {
    operationAttributes: submissionAttributes(submission, true),
    groups: [jobGroup(submission)],
    data,
  });
}

export function createJob(link: Link, submission: Submission): IppMessage {
  return request(link, OPERATION.createJob, {
    operationAttributes: submissionAttributes(submission, false),
    groups: [jobGroup(submission)],
  });
}

export function sendDocument(
  link: Link,
  document: { readonly jobId: number; readonly format: string; readonly name: string },
  data: Uint8Array,
): IppMessage {
  return request(link, OPERATION.sendDocument, {
    operationAttributes: [
      ...jobTarget(document.jobId),
      attribute('document-name', ipp.name(document.name)),
      attribute('document-format', ipp.mimeType(document.format)),
      attribute('last-document', ipp.boolean(true)),
    ],
    data,
  });
}

export function createSubscription(
  link: Link,
  subscription: { readonly events: readonly string[]; readonly leaseSeconds: number },
): IppMessage {
  return request(link, OPERATION.createPrinterSubscriptions, {
    groups: [
      {
        tag: GROUP_TAG.subscription,
        attributes: [
          attribute('notify-pull-method', ipp.keyword('ippget')),
          keywords('notify-events', subscription.events),
          attribute('notify-lease-duration', ipp.integer(subscription.leaseSeconds)),
        ],
      },
    ],
  });
}

export function renewSubscription(
  link: Link,
  subscriptionId: number,
  leaseSeconds: number,
): IppMessage {
  return request(link, OPERATION.renewSubscription, {
    operationAttributes: [attribute('notify-subscription-id', ipp.integer(subscriptionId))],
    groups: [
      {
        tag: GROUP_TAG.subscription,
        attributes: [attribute('notify-lease-duration', ipp.integer(leaseSeconds))],
      },
    ],
  });
}

export function cancelSubscription(link: Link, subscriptionId: number): IppMessage {
  return request(link, OPERATION.cancelSubscription, {
    operationAttributes: [attribute('notify-subscription-id', ipp.integer(subscriptionId))],
  });
}

export function getNotifications(
  link: Link,
  wait: { readonly subscriptionId: number; readonly after: number | null },
): IppMessage {
  return request(link, OPERATION.getNotifications, {
    operationAttributes: [
      attribute('notify-subscription-ids', ipp.integer(wait.subscriptionId)),
      ...(wait.after === null
        ? []
        : [attribute('notify-sequence-numbers', ipp.integer(wait.after + 1))]),
      attribute('notify-wait', ipp.boolean(true)),
    ],
  });
}
