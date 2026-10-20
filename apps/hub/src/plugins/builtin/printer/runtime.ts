import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PluginEvent } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceDriverContext } from '../../../local/device-driver';
import { openMdns, type OpenMdns } from '../../../network/mdns';
import type { PluginContext, PluginStop } from '../contract';
import { parseAddress, portOf, withHost } from './address';
import { SessionActions } from './actions';
import { PrinterClient } from './client';
import { defaultConverter, type Converter } from './convert';
import { PrinterDiscovery, type Candidate } from './discovery';
import { printerDriver } from './driver';
import { workerEncoder } from './raster-encoder';
import { PrinterRegistry } from './registry';
import { PRINTER_RECORD, PRINTERS, readRecords } from './records';
import { searchEntries } from './search';
import { PrinterService } from './service';
import { PrinterSession } from './session';
import {
  SNAPSHOTS,
  readSnapshot,
  reasonOf,
  type ClientSetup,
  type SessionHost,
} from './session-host';
import { printerTools } from './tools';

export type PrinterPluginHost = Pick<
  PluginContext<unknown>,
  | 'log'
  | 'signal'
  | 'records'
  | 'secrets'
  | 'viewers'
  | 'metrics'
  | 'events'
  | 'devices'
  | 'tools'
  | 'search'
  | 'files'
  | 'home'
>;

export interface RuntimeOptions {
  readonly openMdns: OpenMdns;
  readonly openClient: (setup: ClientSetup) => PrinterClient;
  readonly converter: (folder: string, signal: AbortSignal, log: Logger) => Converter;
  readonly now: () => Date;
}

const RASTER_WORKER = fileURLToPath(new URL('./raster-worker.mjs', import.meta.url));

export const DEFAULT_OPTIONS: RuntimeOptions = {
  openMdns,
  openClient: (setup): PrinterClient => new PrinterClient(setup),
  converter: (folder, signal, log): Converter =>
    defaultConverter(folder, signal, workerEncoder(RASTER_WORKER, signal, log)),
  now: (): Date => new Date(),
};

export class PrinterRuntime {
  readonly #registry = new PrinterRegistry();
  readonly #actions: SessionActions;
  #discovery: PrinterDiscovery | null = null;
  #driver: DeviceDriverContext | null = null;
  #searched = '';

  constructor(
    private readonly host: PrinterPluginHost,
    private readonly options: RuntimeOptions = DEFAULT_OPTIONS,
  ) {
    this.#actions = new SessionActions({
      now: options.now,
      log: host.log,
      ports: {
        converter: options.converter(host.files.folder, host.signal, host.log),
        files: {
          fromUpload: host.files.fromUpload,
          fromMachine: host.files.fromMachine,
          attachmentsOf: host.files.attachmentsOf,
          readAttachment: (path): Promise<Buffer> => readFile(path),
        },
      },
    });
  }

  start(): Promise<PluginStop> {
    const sessionHost = this.#sessionHost();
    this.#restore(sessionHost);
    this.host.tools.register(printerTools(this.#service(sessionHost)));
    const unregister = this.host.devices.register(
      printerDriver({
        registry: this.#registry,
        actions: this.#actions,
        attached: (context) => this.#attach(context),
      }),
    );
    this.#startDiscovery();
    for (const session of this.#registry.list()) session.start();
    this.#refreshSearch();
    return Promise.resolve(async (): Promise<void> => {
      unregister();
      for (const session of this.#registry.list()) session.stop();
      await this.#discovery?.stop();
    });
  }

  #sessionHost(): SessionHost {
    const { host } = this;
    return {
      log: host.log,
      clock: { now: this.options.now, timeZone: host.home.timeZone },
      records: host.records,
      secrets: host.secrets,
      viewers: host.viewers,
      metrics: host.metrics,
      send: (event: PluginEvent): void => {
        host.events.emit(event);
      },
      signal: host.signal,
      openClient: this.options.openClient,
      changed: (): void => {
        this.#refreshSearch();
      },
    };
  }

  #service(sessionHost: SessionHost): PrinterService {
    return new PrinterService({
      registry: this.#registry,
      actions: this.#actions,
      host: sessionHost,
      clock: sessionHost.clock,
      discovery: (): PrinterDiscovery | null => this.#discovery,
      pairing: { openClient: this.options.openClient },
      announce: (session): void => {
        if (this.#driver !== null) session.mirror.attach(this.#driver.sink);
      },
      forgotten: async (uuid): Promise<void> => {
        await this.#driver?.forget([uuid]);
        this.#refreshSearch();
      },
    });
  }

  #restore(sessionHost: SessionHost): void {
    const invalid = (key: string): void => {
      this.host.log.warn('printer.record_invalid', { key });
    };
    for (const record of readRecords(this.host.records(PRINTERS), PRINTER_RECORD, invalid)) {
      const snapshot = readSnapshot(this.host.records(SNAPSHOTS).get(record.uuid));
      if (snapshot === null) {
        this.host.log.warn('printer.snapshot_missing', {
          reason: 'A saved printer has no saved description; add it again.',
        });
        continue;
      }
      this.#registry.add(new PrinterSession(sessionHost, record, snapshot, false));
    }
  }

  #attach(context: DeviceDriverContext): () => Promise<void> {
    this.#driver = context;
    for (const session of this.#registry.list()) session.mirror.attach(context.sink);
    return (): Promise<void> => {
      this.#driver = null;
      for (const session of this.#registry.list()) session.mirror.detach();
      return Promise.resolve();
    };
  }

  #startDiscovery(): void {
    try {
      const discovery = new PrinterDiscovery(
        this.options.openMdns,
        {
          found: (candidate): void => {
            this.#found(candidate);
          },
          lost: (candidate): void => {
            this.#registry
              .list()
              .find((session) => session.record.uuid === candidate.uuid)
              ?.goodbye();
          },
        },
        (cause): void => {
          this.host.log.warn('printer.discovery_failed', { reason: reasonOf(cause) });
        },
      );
      discovery.start();
      this.#discovery = discovery;
    } catch (cause) {
      this.host.log.warn('printer.discovery_unavailable', { reason: reasonOf(cause) });
    }
  }

  #found(candidate: Candidate): void {
    const session = this.#registry.list().find((entry) => entry.record.uuid === candidate.uuid);
    if (session === undefined) return;
    const known = parseAddress(session.record.uri);
    const seen = parseAddress(candidate.uri);
    const moved =
      known.url.hostname !== seen.url.hostname || portOf(known.url) !== portOf(seen.url);
    if (moved && known.secure === seen.secure) {
      session.update({ uri: withHost(known, seen.url.hostname, portOf(seen.url)).uri });
      session.reopenClient();
    }
    session.refresh();
  }

  #refreshSearch(): void {
    const sessions = this.#registry.list();
    const signature = sessions.map((session) => `${session.record.uuid}:${session.name}`).join('|');
    if (signature === this.#searched) return;
    this.#searched = signature;
    this.host.search.replace(searchEntries(sessions));
  }
}
