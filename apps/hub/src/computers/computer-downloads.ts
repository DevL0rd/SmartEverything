import {
  ApiError,
  COMPUTER_DOWNLOAD,
  DOWNLOAD_CHUNK,
  DOWNLOAD_PLAN,
  FILE_CHUNK_BYTES,
  FILE_RANGE,
  MEDIA_PATHS,
  type ComputerDownload,
  type DownloadPlan,
  type NodeRequest,
} from '@smarteverything/domain';
import { background, Logger, messageOf } from '@smarteverything/logging';
import { randomUUID } from 'node:crypto';
import { pipeline, Readable } from 'node:stream';
import { promisify } from 'node:util';
import type { z } from 'zod';
import type { Caller } from '../server/auth';
import type { RawRoute } from '../server/http-server';
import type { MediaLinks } from '../server/media-links';
import { sendBytes } from '../server/recording-files';
import type { ComputerViewer } from './computer-access';
import { guarded } from './computer-access';
import type { ComputerDirectory } from './computer-directory';
import type { ComputerService } from './computer-service';
import { attachment, chunks, type ChunkOf } from './file-download';

const log = new Logger('hub.computer-downloads');
const TICKET_LIFETIME_MS = 15 * 60_000;
const streamed = promisify(pipeline);

interface Ticket {
  readonly id: string;
  readonly deviceId: string;
  readonly viewer: ComputerViewer;
  readonly plan: DownloadPlan;
  readonly expiresAt: number;
  claimed: boolean;
}

export interface ComputerDownloadsOptions {
  readonly service: ComputerService;
  readonly directory: ComputerDirectory;
  readonly links: MediaLinks;
  readonly now: () => Date;
}

async function* continued(
  first: IteratorResult<Buffer>,
  rest: AsyncGenerator<Buffer>,
): AsyncGenerator<Buffer> {
  if (first.done === true) {
    return;
  }
  yield first.value;
  yield* rest;
}

export class ComputerDownloads {
  private readonly tickets = new Map<string, Ticket>();

  constructor(private readonly options: ComputerDownloadsOptions) {}

  async prepare(
    caller: Caller,
    deviceId: string,
    paths: readonly string[],
  ): Promise<ComputerDownload> {
    const { service, links, now } = this.options;
    const request: NodeRequest = { verb: 'download_open', paths: [...paths] };
    const plan = await service.ask({ caller, deviceId, request }, DOWNLOAD_PLAN);
    this.forgetStale();
    const id = randomUUID();
    this.tickets.set(id, {
      id,
      deviceId,
      viewer: service.viewer(caller),
      plan,
      expiresAt: now().getTime() + TICKET_LIFETIME_MS,
      claimed: false,
    });
    const link = links.computerDownload(deviceId, id);
    return COMPUTER_DOWNLOAD.parse({
      kind: plan.kind,
      name: plan.name,
      size: plan.kind === 'file' ? plan.size : null,
      files: plan.files,
      folders: plan.folders,
      bytes: plan.bytes,
      skipped: plan.skipped,
      url: link.url,
      expiresAt: link.expiresAt,
    });
  }

  route(): RawRoute {
    return {
      method: 'GET',
      path: MEDIA_PATHS.computerDownload,
      handle: async (request, response, params): Promise<void> => {
        this.options.links.verify(new URL(request.url ?? '/', 'http://hub'));
        const ticket = this.ticket(params['deviceId'] ?? '', params['ticketId'] ?? '');
        const { plan } = ticket;
        if (plan.kind === 'file') {
          const chunkOf: ChunkOf = (start, length) =>
            this.ask(ticket, { verb: 'file_range', path: plan.path, start, length }, FILE_RANGE);
          await chunkOf(0, 1);
          await sendBytes(
            {
              size: plan.size,
              headers: {
                'content-type': plan.mimeType,
                'content-disposition': attachment(plan.name),
                'cache-control': 'no-store',
              },
              stream: (range) =>
                Readable.from(chunks(chunkOf, range?.start ?? 0, range?.end ?? plan.size - 1)),
            },
            request,
            response,
          );
          return;
        }
        ticket.claimed = true;
        const bytes = this.zipBytes(ticket, plan.id);
        const first = await bytes.next();
        response.writeHead(200, {
          'content-type': 'application/zip',
          'content-disposition': attachment(plan.name),
          'cache-control': 'no-store',
        });
        await streamed(Readable.from(continued(first, bytes)), response);
      },
    };
  }

  private ticket(deviceId: string, id: string): Ticket {
    const ticket = this.tickets.get(id);
    if (ticket?.deviceId !== deviceId || ticket.expiresAt <= this.options.now().getTime()) {
      throw new ApiError('not_found', 'This download link is no longer valid; ask for it again.');
    }
    if (ticket.claimed && ticket.plan.kind === 'zip') {
      throw new ApiError('conflict', 'This zip was already fetched; ask for a new link.');
    }
    return ticket;
  }

  private ask<T>(ticket: Ticket, request: NodeRequest, schema: z.ZodType<T>): Promise<T> {
    const { service, directory } = this.options;
    return guarded(async () => {
      service.access.require(ticket.deviceId, 'files', ticket.viewer);
      return schema.parse(await directory.byDevice(ticket.deviceId).call(request));
    });
  }

  private async *zipBytes(ticket: Ticket, id: string): AsyncGenerator<Buffer> {
    try {
      for (;;) {
        const part = await this.ask(
          ticket,
          { verb: 'download_read', id, length: FILE_CHUNK_BYTES },
          DOWNLOAD_CHUNK,
        );
        yield Buffer.from(part.data, 'base64');
        if (part.done) {
          return;
        }
      }
    } finally {
      this.tickets.delete(ticket.id);
      await this.close(ticket, id);
    }
  }

  private async close(ticket: Ticket, id: string): Promise<void> {
    try {
      await this.options.directory.byDevice(ticket.deviceId).call({ verb: 'download_close', id });
    } catch (cause) {
      log.warn('computer.download_close_failed', { reason: messageOf(cause).slice(0, 300) });
    }
  }

  private forgetStale(): void {
    const now = this.options.now().getTime();
    for (const [id, ticket] of this.tickets) {
      if (ticket.expiresAt <= now) {
        this.tickets.delete(id);
        if (ticket.plan.kind === 'zip' && !ticket.claimed) {
          background(this.close(ticket, ticket.plan.id), 'computer.download_close_failed');
        }
      }
    }
  }
}
