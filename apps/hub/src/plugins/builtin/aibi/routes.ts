import type { ServerResponse } from 'node:http';
import type { RobotMode, RobotReport } from '@smarteverything/domain';
import type { ActivityLog } from './activity';
import { bodySummary, SUMMARY_MAX } from './body-summary';
import { ACTIONS } from './catalogue';
import type { TrafficCapture } from './capture';
import type { Exchange, Incoming, Message, Routes } from './connection';
import type { VoiceDesk } from './desk';
import { identityOf, type RobotIdentity } from './identity';
import { downloadFirmware, rememberOffer, type PatchedFirmwareCache } from './ota-files';
import {
  BLOCKED_PREFIX,
  blockOffer,
  firmwareUrls,
  isOfferPath,
  olderVersionRequest,
  patchedOffer,
  type Json,
} from './ota-offer';
import { imageTypeOf } from './photos';
import {
  decodedBody,
  encode,
  ok,
  permission,
  relay,
  summarize,
  tagged,
  type Response,
} from './replies';
import type { Speeches } from './speech-stream';
import { parseStatusReport, reportLine } from './status-report';
import { messageOf } from '@smarteverything/logging';

export interface RouteHost {
  readonly mode: () => RobotMode;
  readonly desk: VoiceDesk;
  readonly speeches: Speeches;
  readonly activity: ActivityLog;
  readonly capture: TrafficCapture;
  readonly folder: string;
  readonly patched: PatchedFirmwareCache;
  readonly contact: (remote: string, path: string) => void;
  readonly report: (report: RobotReport) => void;
  readonly identified: (identity: RobotIdentity) => void;
}

const KNOWN_CLOUD_PATH = /^\/(time|token\/|aibi\/ota\/(res|allres)\/|aibi\/ai\/rockpaper)/;
const SPEECH_PATH = /^\/(?:tts|poweron)\/dl\/([\w.-]+)$/;
const DETECT_INTENT_PATH = '/aibi/voice/detectintent';
const HOUR_MS = 3_600_000;
const NATIVE_IDS: ReadonlySet<string> = new Set(ACTIONS.map((action) => action.id));

function parseJson(message: Response): Json | null {
  try {
    const parsed: unknown = JSON.parse(decodedBody(message).toString('utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed))
      : null;
  } catch (cause) {
    if (cause instanceof Error) {
      return null;
    }
    throw cause;
  }
}

function unreachable(): Response {
  return encode(502, { errcode: 502, errmsg: 'AIBI cloud unreachable' }, { Connection: 'close' });
}

async function* copied(source: AsyncIterable<Buffer>, parts: Buffer[]): AsyncIterable<Buffer> {
  for await (const chunk of source) {
    parts.push(chunk);
    yield chunk;
  }
}

export class AibiRoutes implements Routes {
  private readonly reported = new Map<string, number>();

  constructor(private readonly host: RouteHost) {}

  streams(method: string, path: string): boolean {
    return this.host.mode() === 'local' && method === 'POST' && path === DETECT_INTENT_PATH;
  }

  async stream(request: Incoming): Promise<Response> {
    const started = new Date();
    this.seen(request.remote, request.path, request.head.headers);
    const parts: Buffer[] = [];
    const chunks = this.host.capture.on ? copied(request.chunks(), parts) : request.chunks();
    const reply = ok(
      await this.host.desk.listen(chunks, {
        index: Number(request.query.get('index') ?? 0) || 0,
        timeZone: request.query.get('timezone'),
        chat: request.query.get('role') === 'chatgpt',
      }),
    );
    this.host.capture.record({
      scheme: request.scheme,
      remote: request.remote,
      started,
      request: { ...request.head, body: Buffer.concat(parts) },
      response: reply,
    });
    return reply;
  }

  failed(detail: string): void {
    this.host.activity.add('warning', 'AIBI connection problem', detail);
  }

  async handle(exchange: Exchange, response: ServerResponse): Promise<Response | 'served'> {
    const started = new Date();
    this.seen(exchange.remote, exchange.path, exchange.message.headers);
    const reply = await this.respond(exchange, response);
    this.host.capture.record({
      scheme: exchange.scheme,
      remote: exchange.remote,
      started,
      request: exchange.message,
      response: reply,
    });
    return reply;
  }

  private seen(remote: string, path: string, headers: Readonly<Record<string, string>>): void {
    this.host.contact(remote, path);
    const identity = identityOf(headers);
    if (identity !== null) {
      this.host.identified(identity);
    }
  }

  private async respond(
    exchange: Exchange,
    response: ServerResponse,
  ): Promise<Response | 'served'> {
    const trapped = await this.firmware(exchange);
    if (trapped !== null) {
      return trapped;
    }
    if (this.host.mode() === 'passthrough' || isOfferPath(exchange.path)) {
      return this.observe(exchange);
    }
    const speech = exchange.method === 'GET' ? SPEECH_PATH.exec(exchange.path)?.[1] : undefined;
    if (speech !== undefined) {
      return this.speech(speech, response);
    }
    return (
      (await this.local(exchange)) ?? this.forward(exchange, !KNOWN_CLOUD_PATH.test(exchange.path))
    );
  }

  private speech(id: string, response: ServerResponse): Response | 'served' {
    const stream = this.host.speeches.find(id);
    if (stream === null) {
      return encode(404, { error: 'tts_not_found' }, { Connection: 'close' });
    }
    stream.serve(response);
    return 'served';
  }

  private async firmware(exchange: Exchange): Promise<Response | null> {
    if (exchange.method !== 'GET') {
      return null;
    }
    if (exchange.path.startsWith(BLOCKED_PREFIX)) {
      return encode(
        403,
        { errcode: 403, errmsg: 'Firmware download blocked' },
        { Connection: 'close' },
      );
    }
    const patched = await this.host.patched.get();
    if (patched === null) {
      return null;
    }
    if (exchange.path === patched.urlPath) {
      this.host.activity.add('firmware', 'Patched firmware served', patched.name);
      return ok(patched.bytes, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${patched.name}"`,
        Connection: 'close',
      });
    }
    if (isOfferPath(exchange.path)) {
      this.host.activity.add(
        'firmware',
        'Offered patched firmware',
        `${patched.versionName} (${patched.md5})`,
      );
      return ok(patchedOffer(patched), { Connection: 'close' });
    }
    return null;
  }

  private local(exchange: Exchange): Promise<Response> | null {
    const { method, path, query, message } = exchange;
    const zone = query.get('tz') ?? query.get('timezone');
    const { desk } = this.host;
    const routes: Readonly<Record<string, () => Promise<Response>>> = {
      'GET /aibi/permission': () => Promise.resolve(ok(permission())),
      'POST /aibi/report/status': () => Promise.resolve(this.status(message)),
      'POST /aibi/messages/send': () => Promise.resolve(this.friendMessage(message)),
      'GET /aibi/messages/receive': () => Promise.resolve(ok(tagged('getmessage', { m_list: [] }))),
      'GET /aibi/messages/confirm': () => Promise.resolve(ok(tagged('get message'))),
      'GET /aibi/poweron/voice': async () => ok(await desk.powerOn(zone)),
      'GET /aibi/speech/tts': async () => ok(await desk.readAloud(query.get('q') ?? '')),
      'GET /aibi/chat/start': async () => ok(await desk.chatStart(zone)),
      'POST /aibi/ai/imgrecog': async () =>
        ok(await desk.look(message.body, await imageTypeOf(message.body))),
    };
    return routes[`${method} ${path}`]?.() ?? null;
  }

  private status(message: Message): Response {
    const report = parseStatusReport(message.body, message.headers['content-type'] ?? '');
    if (report === null) {
      this.host.activity.add('warning', 'AIBI sent a status report this plugin could not read');
    } else {
      this.host.report(report);
      this.host.activity.add('status', 'AIBI reported its status', reportLine(report));
    }
    return ok(tagged('status'));
  }

  private friendMessage(message: Message): Response {
    this.host.activity.add(
      'request',
      'AIBI sent a friend message',
      bodySummary(message.body, message.headers['content-type']),
    );
    return ok(tagged('sendmessage'));
  }

  private async forward(exchange: Exchange, unknown: boolean): Promise<Response> {
    if (unknown) {
      this.newRequest(exchange);
    }
    try {
      return relay(await exchange.forward());
    } catch (error) {
      this.cloudFailed(exchange, error);
      return unreachable();
    }
  }

  private cloudFailed(exchange: Exchange, error: unknown): void {
    this.host.activity.add(
      'warning',
      `Could not reach the AIBI cloud for ${exchange.path}`,
      messageOf(error),
    );
  }

  private newRequest(exchange: Exchange): void {
    const key = `${exchange.method} ${exchange.path}`;
    if (Date.now() - (this.reported.get(key) ?? 0) < HOUR_MS) {
      return;
    }
    this.reported.set(key, Date.now());
    const query = exchange.query.toString();
    const body = bodySummary(exchange.message.body, exchange.message.headers['content-type']);
    const detail = [query === '' ? '' : `query ${query}`, body].filter((part) => part !== '');
    this.host.activity.add('unknown', `New request: ${key}`, detail.join(' · '));
  }

  private async observe(exchange: Exchange): Promise<Response> {
    const older = olderVersionRequest(exchange.message.startLine);
    let response: Response;
    try {
      response = await exchange.forward(
        older === null ? undefined : { ...exchange.message, startLine: older },
      );
    } catch (error) {
      this.cloudFailed(exchange, error);
      return unreachable();
    }
    if (older !== null) {
      this.host.activity.add('firmware', 'Asked the cloud for updates as an older version', older);
    }
    if (isOfferPath(exchange.path)) {
      return this.trapOffer(exchange, response);
    }
    this.learn(exchange, response);
    return relay(response);
  }

  private learn(exchange: Exchange, response: Response): void {
    const json = parseJson(response);
    const summary = json === null ? null : summarize(json);
    if (summary === null || (summary.behavior === '' && summary.url === '')) {
      return;
    }
    const detail = [
      summary.queryText === '' ? '' : `heard "${summary.queryText}"`,
      summary.text === '' ? '' : `said "${summary.text}"`,
    ]
      .filter((part) => part !== '')
      .join(', ');
    this.host.activity.add(
      'request',
      `Cloud answered ${exchange.path}: ${summary.behavior === '' ? 'speech' : summary.behavior}`,
      detail,
    );
    this.flagNewBehavior(summary.behavior, summary.params);
  }

  private flagNewBehavior(behavior: string, params: Readonly<Record<string, unknown>>): void {
    if (behavior === '' || NATIVE_IDS.has(behavior) || behavior === 'interact_speak') {
      return;
    }
    this.host.activity.add(
      'unknown',
      `New behavior seen: ${behavior}`,
      JSON.stringify(params).slice(0, SUMMARY_MAX),
    );
  }

  private trapOffer(exchange: Exchange, response: Response): Response {
    const json = parseJson(response);
    if (json === null) {
      return relay(response);
    }
    const urls = firmwareUrls(json);
    this.rememberAndDownload(exchange, json, urls);
    this.host.activity.add(
      'firmware',
      'Update offer trapped',
      urls.length > 0
        ? `${String(urls.length)} firmware link(s) captured and hidden from AIBI`
        : 'no firmware link',
    );
    const headers = Object.fromEntries(
      Object.entries(response.headers).filter(([name]) => name !== 'content-encoding'),
    );
    return relay({ ...response, headers, body: Buffer.from(JSON.stringify(blockOffer(json))) });
  }

  private rememberAndDownload(exchange: Exchange, json: Json, urls: readonly string[]): void {
    rememberOffer(this.host.folder, json).catch((error: unknown) => {
      this.host.activity.add('warning', 'Could not save the update offer', messageOf(error));
    });
    for (const url of urls) {
      downloadFirmware(this.host.folder, url, exchange.message.headers).then(
        (saved) => {
          this.host.activity.add(
            'firmware',
            'Firmware downloaded',
            `${saved.file} (${String(saved.bytes)} bytes)`,
          );
        },
        (error: unknown) => {
          this.host.activity.add('warning', 'Firmware download failed', messageOf(error));
        },
      );
    }
  }
}
