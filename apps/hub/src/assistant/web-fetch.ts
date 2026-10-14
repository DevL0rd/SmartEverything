import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http';
import { proxyRouteFor } from '@deepseek-ai/dsh-http-proxy';
import { fetchMetaFromValue, formatFetchOutput } from '@deepseek-ai/dsh-tool-web';
import type { WebFetchResult } from '@deepseek-ai/dsh-web';
import { ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import type { ToolSource, HubTool, HubToolResult, ToolCaller } from '../ai-tools/hub-tool';
import type { HarnessService } from '../harness/service';
import {
  admitExecutionTool,
  currentExecutionAuthorities,
  withExecutionAuthorities,
} from './execution-authority';
import { currentRequestSignal } from '../server/request-signal';
import { effectiveTools } from './coordination/grants';

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_BODY_CHARS = 40_000;
const MAX_OUTPUT_CHARS = 40_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const MAX_ACTIVE_FETCHES = 4;
const INPUT = z.strictObject({
  url: z
    .url({ protocol: /^https?$/u })
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return url.username === '' && url.password === '';
    }, 'Web fetch URLs must not contain credentials.'),
});
const META = z.strictObject({
  url: z.string().max(2048),
  statusCode: z.number().int(),
  truncated: z.boolean(),
});
const TOOL: HubTool = {
  name: 'web_fetch',
  title: 'Read a webpage',
  description:
    'Read one explicit public HTTP(S) URL anonymously as bounded untrusted text or HTML converted to Markdown. Follows at most three same-origin redirects; no private networks, credentials, proxy routes, browser execution or binary documents. Uses this chat’s existing tool grants; no model supplier is required.',
  inputSchema: z.toJSONSchema(INPUT, { io: 'input' }),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: true,
  },
  origin: { kind: 'core' },
  humanOnly: false,
};

export function webFetchSource(service: HarnessService): ToolSource {
  const provider = new HttpFetchProvider({
    maxResponseBytes: MAX_RESPONSE_BYTES,
    maxBodyChars: MAX_BODY_CHARS,
    timeoutMs: TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
    userAgent: 'SmartEverything/0.1 (public-document-reader)',
  });
  let active = 0;
  return {
    tools: () => [TOOL],
    changes: (): (() => void) => (): void => undefined,
    validate: (_tool, args): string | null => {
      const parsed = INPUT.safeParse(args);
      return parsed.success ? null : parsed.error.message;
    },
    call: async (_tool, args, caller): Promise<HubToolResult> => {
      const { url } = INPUT.parse(args);
      const signal = currentRequestSignal();
      const verify = fetchValidation(service, caller, args, signal);
      verify();
      if (proxyRouteFor(new URL(url)).proxied)
        throw new ApiError(
          'forbidden',
          'Web fetch cannot enforce public DNS pinning through this configured proxy route.',
        );
      if (active >= MAX_ACTIVE_FETCHES)
        throw new ApiError(
          'conflict',
          'The public webpage reader has no available bounded fetch slot.',
        );
      active++;
      try {
        const result = await provider.fetch({ url }, signal);
        verify();
        return fetchedPage(result);
      } finally {
        active--;
      }
    },
  };
}

function fetchedPage(result: WebFetchResult): HubToolResult {
  const metadata = META.parse(fetchMetaFromValue(result, MAX_OUTPUT_CHARS));
  return {
    response: { ...metadata, content: formatFetchOutput(result, MAX_OUTPUT_CHARS) },
    line: 'Read webpage',
    pictures: [],
  };
}

function verifyGrant(service: HarnessService, caller: ToolCaller): void {
  if (caller.chatId === null) return;
  const chat = service.store.aiChats.chat(caller.chatId);
  const allowed = effectiveTools(service.store, chat);
  if (chat.profile_id !== caller.profileId || (allowed !== null && !allowed.includes(TOOL.name)))
    throw new ApiError('forbidden', 'This initiating chat no longer grants webpage fetch access.');
}

function fetchValidation(
  service: HarnessService,
  caller: ToolCaller,
  args: Readonly<Record<string, unknown>>,
  signal: AbortSignal | undefined,
): () => void {
  const authorities = [
    ...(caller.authority === undefined ? [] : [caller.authority]),
    ...currentExecutionAuthorities(),
  ];
  return (): void => {
    signal?.throwIfAborted();
    withExecutionAuthorities(authorities, () => {
      for (const authority of authorities)
        admitExecutionTool(service.store, TOOL.name, args, authority);
      verifyGrant(service, caller);
    });
  };
}
