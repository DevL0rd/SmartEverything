import path from 'node:path';
import { Message, MessageFlag, Variant, sessionBus } from '@jellybrick/dbus-next';
import { Logger, background } from '@smarteverything/logging';
import { z } from 'zod';
import { SCHEME_HANDLER_FILE } from './scheme-handler.js';

const log = new Logger('desktop.tray');

const SERVER = 'org.kde.JobViewServer';
const SERVER_PATH = '/JobViewServer';
const SERVER_INTERFACE = 'org.kde.JobViewServerV2';
const VIEW_INTERFACE = 'org.kde.JobViewV3';
const DBUS = 'org.freedesktop.DBus';
const DESKTOP_ENTRY = path.basename(SCHEME_HANDLER_FILE, '.desktop');
const APP_NAME = 'SmartEverything';
const NO_CAPABILITIES = 0;
const KILLED_JOB_ERROR = 1;
const USER_DEFINED_ERROR = 100;

const RETURNED_PATH = z.tuple([z.string()]);
const FLAG = z.tuple([z.boolean()]);

export interface SyncJobProgress {
  readonly title: string;
  readonly percent: number;
  readonly processedBytes: number;
  readonly totalBytes: number;
  readonly processedFiles: number;
  readonly totalFiles: number;
  readonly bytesPerSecond: number | null;
  readonly current: string | null;
  readonly info: string;
}

export type SyncJobEnd =
  | { readonly kind: 'done' }
  | { readonly kind: 'paused' }
  | { readonly kind: 'failed'; readonly message: string };

export interface SyncJob {
  update(progress: SyncJobProgress): void;
  finish(end: SyncJobEnd): void;
}

export type SyncJobsStatus =
  | { readonly state: 'checking' }
  | { readonly state: 'ready' }
  | { readonly state: 'unavailable'; readonly reason: string };

export interface SyncJobs {
  status(): SyncJobsStatus;
  onStatus(listener: (status: SyncJobsStatus) => void): void;
  open(progress: SyncJobProgress): SyncJob;
  stop(): void;
}

export interface JobBus {
  call(message: Message): Promise<{ readonly body: unknown[] } | null>;
  send(message: Message): void;
  on(event: 'error', listener: (cause: unknown) => void): unknown;
  disconnect(): void;
}

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function whole(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value)));
}

export function jobPropertiesOf(progress: SyncJobProgress): Record<string, Variant> {
  const properties: Record<string, Variant> = {
    title: new Variant('s', progress.title),
    infoMessage: new Variant('s', progress.info),
    percent: new Variant('u', Math.min(100, Math.max(0, Math.floor(progress.percent)))),
    processedBytes: new Variant('t', whole(progress.processedBytes)),
    totalBytes: new Variant('t', whole(progress.totalBytes)),
    processedFiles: new Variant('t', whole(progress.processedFiles)),
    totalFiles: new Variant('t', whole(progress.totalFiles)),
  };
  if (progress.bytesPerSecond !== null) {
    properties['speed'] = new Variant('t', whole(progress.bytesPerSecond));
  }
  if (progress.current !== null) {
    properties['descriptionLabel1'] = new Variant('s', 'Now');
    properties['descriptionValue1'] = new Variant('s', progress.current);
  }
  return properties;
}

function terminateBody(end: SyncJobEnd): unknown[] {
  if (end.kind === 'done') return [0, '', {}];
  if (end.kind === 'paused') return [KILLED_JOB_ERROR, 'Sync paused', {}];
  return [USER_DEFINED_ERROR, end.message, {}];
}

function viewMessage(jobPath: string, member: string, signature: string, body: unknown[]): Message {
  return new Message({
    destination: SERVER,
    path: jobPath,
    interface: VIEW_INTERFACE,
    member,
    signature,
    body,
    flags: MessageFlag.NO_REPLY_EXPECTED,
  });
}

class KdeJob implements SyncJob {
  #view: { readonly bus: JobBus; readonly path: string } | null = null;
  #latest: SyncJobProgress;
  #end: SyncJobEnd | null = null;

  constructor(bus: Promise<JobBus | null>, first: SyncJobProgress) {
    this.#latest = first;
    background(this.#start(bus), 'tray.job_view_start_failed');
  }

  update(progress: SyncJobProgress): void {
    this.#latest = progress;
    if (this.#end !== null || this.#view === null) return;
    this.#send(this.#view);
  }

  finish(end: SyncJobEnd): void {
    if (this.#end !== null) return;
    this.#end = end;
    if (this.#view !== null) this.#terminate(this.#view, end);
  }

  async #start(ready: Promise<JobBus | null>): Promise<void> {
    const bus = await ready;
    if (bus === null) return;
    let jobPath: string;
    try {
      const reply = await bus.call(
        new Message({
          destination: SERVER,
          path: SERVER_PATH,
          interface: SERVER_INTERFACE,
          member: 'requestView',
          signature: 'sia{sv}',
          body: [
            DESKTOP_ENTRY,
            NO_CAPABILITIES,
            { 'application-display-name': new Variant('s', APP_NAME) },
          ],
        }),
      );
      jobPath = RETURNED_PATH.parse(reply?.body)[0];
    } catch (cause) {
      log.warn('tray.job_view_failed', { reason: reasonOf(cause) });
      return;
    }
    const view = { bus, path: jobPath };
    this.#view = view;
    log.debug('tray.job_view_opened', { path: jobPath });
    this.#send(view);
    if (this.#end !== null) this.#terminate(view, this.#end);
  }

  #send(view: { readonly bus: JobBus; readonly path: string }): void {
    view.bus.send(viewMessage(view.path, 'update', 'a{sv}', [jobPropertiesOf(this.#latest)]));
  }

  #terminate(view: { readonly bus: JobBus; readonly path: string }, end: SyncJobEnd): void {
    view.bus.send(viewMessage(view.path, 'terminate', 'usa{sv}', terminateBody(end)));
    log.debug('tray.job_view_ended', { path: view.path, end: end.kind });
  }
}

async function serverRunning(bus: JobBus): Promise<boolean> {
  const reply = await bus.call(
    new Message({
      destination: DBUS,
      path: '/org/freedesktop/DBus',
      interface: DBUS,
      member: 'NameHasOwner',
      signature: 's',
      body: [SERVER],
    }),
  );
  return FLAG.parse(reply?.body)[0];
}

export class KdeSyncJobs implements SyncJobs {
  #status: SyncJobsStatus = { state: 'checking' };
  readonly #listeners = new Set<(status: SyncJobsStatus) => void>();
  readonly #bus: JobBus | null;
  readonly #ready: Promise<JobBus | null>;

  constructor(platform: NodeJS.Platform, connect: () => JobBus = sessionBus) {
    if (platform !== 'linux') {
      this.#bus = null;
      this.#ready = Promise.resolve(this.#unavailable('job progress needs KDE Plasma on Linux'));
      return;
    }
    let bus: JobBus;
    try {
      bus = connect();
    } catch (cause) {
      this.#bus = null;
      this.#ready = Promise.resolve(this.#unavailable(`no session D-Bus: ${reasonOf(cause)}`));
      return;
    }
    bus.on('error', (cause) => {
      log.warn('tray.job_bus_error', { reason: reasonOf(cause) });
    });
    this.#bus = bus;
    this.#ready = this.#check(bus);
  }

  status(): SyncJobsStatus {
    return this.#status;
  }

  onStatus(listener: (status: SyncJobsStatus) => void): void {
    this.#listeners.add(listener);
  }

  open(progress: SyncJobProgress): SyncJob {
    return new KdeJob(this.#ready, progress);
  }

  stop(): void {
    this.#listeners.clear();
    this.#bus?.disconnect();
  }

  async #check(bus: JobBus): Promise<JobBus | null> {
    try {
      if (!(await serverRunning(bus))) {
        return this.#unavailable(`this desktop has no ${SERVER} service`);
      }
    } catch (cause) {
      return this.#unavailable(`the session D-Bus did not answer: ${reasonOf(cause)}`);
    }
    this.#set({ state: 'ready' });
    log.info('tray.job_progress_ready');
    return bus;
  }

  #unavailable(reason: string): null {
    log.warn('tray.job_progress_unavailable', { reason });
    this.#set({ state: 'unavailable', reason });
    return null;
  }

  #set(status: SyncJobsStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
  }
}
