import { defineNodeKind, type NodeKind } from './define';

export const HTTP_FORBIDDEN_HEADERS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'x-api-key',
] as const;

export const HTTP_AUTH_SCHEMES = ['bearer', 'basic', 'header', 'query'] as const;

export function forbiddenHeaderNames(headers: readonly string[]): readonly string[] {
  return headers.filter((name) =>
    HTTP_FORBIDDEN_HEADERS.some((forbidden) => forbidden === name.trim().toLowerCase()),
  );
}

export const HTTP_REQUEST = defineNodeKind({
  id: 'http.request',
  name: 'Web request',
  category: 'web',
  icon: 'globe',
  class: 'effect',
  description: 'Sends a web request and gives back the status, headers and body of the answer.',
  inputs: [
    {
      name: 'url',
      type: { t: 'text' },
      required: true,
      live: true,
      description: 'The address to call.',
      summary: true,
    },
    {
      name: 'method',
      type: {
        t: 'choice',
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((id) => ({ id, label: id })),
      },
      required: false,
      default: 'GET',
      static: true,
      description: 'The request method.',
      summary: true,
    },
    {
      name: 'headers',
      type: { t: 'record', values: { t: 'text' } },
      required: false,
      default: {},
      description:
        'Extra headers. authorization, proxy-authorization, cookie and x-api-key are refused: use auth.',
    },
    {
      name: 'query',
      type: { t: 'record', values: { t: 'text' } },
      required: false,
      default: {},
      description: 'Query parameters added to the address.',
    },
    {
      name: 'body',
      type: { t: 'optional', of: { t: 'any' } },
      required: false,
      description: 'The request body.',
    },
    {
      name: 'bodyKind',
      type: {
        t: 'choice',
        options: [
          { id: 'json', label: 'JSON' },
          { id: 'form', label: 'Form' },
          { id: 'text', label: 'Text' },
        ],
      },
      required: false,
      default: 'json',
      static: true,
      description: 'How the body is encoded.',
    },
    {
      name: 'auth',
      type: {
        t: 'optional',
        of: {
          t: 'record',
          fields: {
            secret: { t: 'ref', of: 'secret' },
            scheme: {
              t: 'choice',
              options: HTTP_AUTH_SCHEMES.map((id) => ({ id, label: id })),
            },
            name: { t: 'optional', of: { t: 'text' } },
          },
        },
      },
      required: false,
      static: true,
      description: 'A stored secret and how to send it.',
      ui: { editor: 'http-auth' },
    },
    {
      name: 'timeout',
      type: { t: 'duration' },
      required: false,
      default: 30000,
      static: true,
      description: 'How long to wait for an answer.',
    },
    {
      name: 'followRedirects',
      type: { t: 'boolean' },
      required: false,
      default: true,
      static: true,
      description: 'Whether to follow redirects.',
    },
    {
      name: 'responseKind',
      type: {
        t: 'choice',
        options: [
          { id: 'auto', label: 'Automatic' },
          { id: 'json', label: 'JSON' },
          { id: 'text', label: 'Text' },
        ],
      },
      required: false,
      default: 'auto',
      static: true,
      description: 'How the answer body is read.',
    },
    {
      name: 'acceptStatus',
      type: { t: 'list', of: { t: 'number', integer: true, min: 100, max: 599 } },
      required: false,
      default: [],
      static: true,
      description: 'Statuses outside 200 to 299 that are not treated as a failure.',
    },
    {
      name: 'allowLocalNetwork',
      type: { t: 'boolean' },
      required: false,
      default: false,
      static: true,
      description:
        'Allow addresses on this network. Checked after name lookup and on every redirect.',
    },
  ],
  outputs: [
    { name: 'status', type: { t: 'number', integer: true }, description: 'The status code.' },
    { name: 'ok', type: { t: 'boolean' }, description: 'Whether the status was a success.' },
    {
      name: 'headers',
      type: { t: 'record', values: { t: 'text' } },
      description: 'The answer headers.',
    },
    { name: 'body', type: { t: 'any' }, description: 'The answer body as JSON or text.' },
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: '{method} {url}',
  keywords: ['http', 'api', 'webhook', 'fetch', 'rest', 'get', 'post', 'url'],
  access: 'owner',
  tier: 'v1',
});

const HTTP_RESPOND = defineNodeKind({
  id: 'http.respond',
  name: 'Answer webhook',
  category: 'web',
  icon: 'reply',
  class: 'effect',
  description:
    'Answers the web request that started this run. It works once per run and only in a run started by a webhook.',
  inputs: [
    {
      name: 'status',
      type: { t: 'number', integer: true, min: 100, max: 599 },
      required: false,
      default: 200,
      static: true,
      description: 'The status code of the answer.',
      summary: true,
    },
    {
      name: 'body',
      type: { t: 'optional', of: { t: 'any' } },
      required: false,
      description: 'The answer body, as JSON or text.',
    },
    {
      name: 'headers',
      type: { t: 'record', values: { t: 'text' } },
      required: false,
      default: {},
      static: true,
      description: 'Extra answer headers.',
    },
  ],
  outputs: [],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: 'Answer the webhook with {status}',
  keywords: ['webhook', 'respond', 'reply', 'answer', 'http'],
  access: 'owner',
  tier: 'v1.1',
});

export const HTTP_KINDS: readonly NodeKind[] = [HTTP_REQUEST, HTTP_RESPOND];
