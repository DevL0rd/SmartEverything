import { PrinterError, type PrinterJob } from '@smarteverything/domain';
import type { ToolCaller } from '../../../src/plugins/builtin/contract';
import { SessionActions } from '../../../src/plugins/builtin/printer/actions';
import type { Converter } from '../../../src/plugins/builtin/printer/convert';
import { PrinterRegistry } from '../../../src/plugins/builtin/printer/registry';
import { PrinterService, type ServiceDeps } from '../../../src/plugins/builtin/printer/service';
import type { Candidate } from '../../../src/plugins/builtin/printer/discovery';
import { PrinterClient } from '../../../src/plugins/builtin/printer/client';
import { testLogger } from '../../support/logs';
import { newRig, type Rig } from './rig';

export const OWNER: ToolCaller = {
  profileId: 'owner-1',
  role: 'owner',
  chatId: null,
  via: 'app',
  clientId: null,
};
export const ANNA: ToolCaller = {
  profileId: 'anna',
  role: 'member',
  chatId: 'chat-anna',
  via: 'app',
  clientId: null,
};
export const BEN: ToolCaller = {
  profileId: 'ben',
  role: 'member',
  chatId: 'chat-ben',
  via: 'app',
  clientId: null,
};

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ServiceRig {
  readonly rig: Rig;
  readonly service: PrinterService;
  readonly registry: PrinterRegistry;
  readonly converted: { kind: string; length: number }[];
  readonly uploads: Map<string, { profile: string; name: string; data: Buffer }>;
  readonly searchable: { count: number };
  readonly forgotten: string[];
  readonly announced: string[];
}

function converterOf(log: { kind: string; length: number }[]): Converter {
  const stub = (kind: string, data: Uint8Array): Promise<Uint8Array> => {
    log.push({ kind, length: data.length });
    return Promise.resolve(Uint8Array.of(0x52, 0x61, 0x53, 0x32));
  };
  return {
    pdfToRaster: (data): Promise<Uint8Array> => stub('pdf-raster', data),
    imageToRaster: (data): Promise<Uint8Array> => stub('image-raster', data),
    imageToJpeg: (data): Promise<Uint8Array> => {
      log.push({ kind: 'jpeg', length: data.length });
      return Promise.resolve(JPEG);
    },
  };
}

interface Upload {
  profile: string;
  name: string;
  data: Buffer;
}

type ActionFiles = ConstructorParameters<typeof SessionActions>[0]['ports']['files'];

function filesOf(uploads: ReadonlyMap<string, Upload>): ActionFiles {
  return {
    fromUpload: (caller, id): ReturnType<ActionFiles['fromUpload']> => {
      const upload = uploads.get(id);
      const allowed =
        upload !== undefined && (caller.role === 'owner' || upload.profile === caller.profileId);
      return Promise.resolve(allowed ? { data: upload.data, name: upload.name } : null);
    },
    fromMachine: (): ReturnType<ActionFiles['fromMachine']> => Promise.resolve(null),
    attachmentsOf: (): readonly string[] => [],
    readAttachment: (): Promise<Buffer> =>
      Promise.reject(new PrinterError('not_authorized', 'no attachments in this test')),
  };
}

function discovery(candidates: readonly Candidate[] | null): ServiceDeps['discovery'] {
  return (): ReturnType<ServiceDeps['discovery']> =>
    candidates === null
      ? null
      : { candidates: (): readonly Candidate[] => candidates, rescan: (): void => undefined };
}

export function newServiceRig(
  rig: Rig = newRig(),
  openClient = (setup: ConstructorParameters<typeof PrinterClient>[0]): PrinterClient =>
    new PrinterClient(setup),
  candidates: readonly Candidate[] | null = null,
): ServiceRig {
  const registry = new PrinterRegistry();
  const converted: { kind: string; length: number }[] = [];
  const uploads = new Map<string, Upload>();
  const forgotten: string[] = [];
  const announced: string[] = [];
  const actions = new SessionActions({
    now: rig.host.clock.now,
    log: testLogger('printer'),
    ports: { converter: converterOf(converted), files: filesOf(uploads) },
  });
  const service = new PrinterService({
    registry,
    actions,
    host: { ...rig.host, openClient },
    clock: rig.host.clock,
    discovery: discovery(candidates),
    pairing: { openClient },
    announce: (session): void => {
      announced.push(session.record.uuid);
      session.mirror.attach(rig.sink);
    },
    forgotten: (uuid): Promise<void> => {
      forgotten.push(uuid);
      return Promise.resolve();
    },
  });
  return {
    rig,
    service,
    registry,
    converted,
    uploads,
    searchable: { count: 0 },
    forgotten,
    announced,
  };
}

export function jobKeyOf(job: PrinterJob | null | undefined): string {
  if (job === null || job === undefined) throw new Error('The print produced no job.');
  return job.key;
}
