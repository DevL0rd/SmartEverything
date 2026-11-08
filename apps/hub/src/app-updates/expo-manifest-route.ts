import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { TLSSocket } from 'node:tls';
import { APP_UPDATE_MANIFEST_PATH, ApiError } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { RawRoute } from '../server/http-server';
import type { MediaLinks } from '../server/media-links';
import { noteCaller } from '../server/request-trace';
import type { Store } from '../store/store';
import { expoAnswerFor, expoDirectiveFor, expoManifestFor, type ExpoAnswer } from './expo-manifest';
import { parseExpoRequest, type ExpoRequest } from './expo-request';
import { AppUpdateSigningUnavailableError, type ManifestSigner } from './manifest-signing';
import { multipartMixed, type MultipartPart } from './multipart';
import { clientForUpdateKey } from './update-key';
import type { AppUpdateFolder } from './update-folder';

export interface ExpoManifestRouteOptions {
  readonly store: Store;
  readonly links: MediaLinks;
  readonly folder: AppUpdateFolder;
  readonly signer: ManifestSigner;
  readonly log: Logger;
}

const PROTOCOL_HEADERS = {
  'expo-protocol-version': '1',
  'expo-sfv-version': '0',
  'expo-manifest-filters': '',
  'expo-server-defined-headers': '',
  'cache-control': 'private, max-age=0',
} as const;

function publicOriginOf(store: Store, request: IncomingMessage): string {
  const host = request.headers.host;
  if (host === undefined) {
    throw new ApiError('invalid_request', 'The header host is missing.', 'received no header');
  }
  const publicUrl = store.settings.read().public_url;
  if (publicUrl !== null && new URL(publicUrl).host === host) return new URL(publicUrl).origin;
  return `${request.socket instanceof TLSSocket ? 'https' : 'http'}://${host}`;
}

function partOf(name: 'manifest' | 'directive', body: string): MultipartPart {
  return { name, contentType: 'application/json', body };
}

function bodyOf(options: ExpoManifestRouteOptions, answer: ExpoAnswer, origin: string): string {
  return JSON.stringify(
    answer.kind === 'manifest'
      ? expoManifestFor(answer.entry, origin, (sha256) => options.links.appUpdateBlob(sha256).url)
      : expoDirectiveFor(answer),
  );
}

function signed(
  options: ExpoManifestRouteOptions,
  expo: ExpoRequest,
  part: MultipartPart,
): MultipartPart {
  if (!expo.expectsSignature) return part;
  try {
    return { ...part, headers: { 'expo-signature': options.signer.signatureHeader(part.body) } };
  } catch (cause) {
    if (cause instanceof AppUpdateSigningUnavailableError) {
      throw new ApiError('internal', cause.message);
    }
    throw cause;
  }
}

async function answerFor(
  options: ExpoManifestRouteOptions,
  request: IncomingMessage,
  expo: ExpoRequest,
  clientId: string,
): Promise<{ readonly answer: ExpoAnswer; readonly part: MultipartPart }> {
  const answer = expoAnswerFor(await options.folder.entries(), expo, clientId);
  const origin = answer.kind === 'manifest' ? publicOriginOf(options.store, request) : '';
  const name = answer.kind === 'manifest' ? 'manifest' : 'directive';
  return { answer, part: signed(options, expo, partOf(name, bodyOf(options, answer, origin))) };
}

export function expoManifestRoute(options: ExpoManifestRouteOptions): RawRoute {
  return {
    method: 'GET',
    path: APP_UPDATE_MANIFEST_PATH,
    handle: async (request, response): Promise<void> => {
      const expo = parseExpoRequest(request);
      const client = clientForUpdateKey(options.store, request, expo.key, options.log);
      noteCaller(response, { kind: 'client', client });
      const { answer, part } = await answerFor(options, request, expo, client.id);
      const body = multipartMixed(randomBytes(16).toString('hex'), [part]);
      response.writeHead(200, {
        ...PROTOCOL_HEADERS,
        'content-type': body.contentType,
        'content-length': body.bytes.byteLength,
      });
      response.end(body.bytes);
      options.log.info('app_update.manifest_served', {
        answer: answer.kind,
        updateId: answer.kind === 'manifest' ? answer.entry.id : null,
        channel: expo.channel,
        runtimeVersion: expo.runtimeVersion,
      });
    },
  };
}
