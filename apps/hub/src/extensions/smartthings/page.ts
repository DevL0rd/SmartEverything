import type { ServerResponse } from 'node:http';
import { htmlPage } from '../../server/page-style';

export const PAGE_OUTCOMES = [
  'linked',
  'linking',
  'failed',
  'cancelled',
  'expired',
  'malformed',
] as const;

export type PageOutcome = (typeof PAGE_OUTCOMES)[number];

interface PageMessage {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
}

const MESSAGES: Readonly<Record<PageOutcome, PageMessage>> = {
  linked: {
    status: 200,
    title: 'SmartThings is linked',
    detail: 'Linked — return to the app. You can close this tab.',
  },
  linking: {
    status: 202,
    title: 'SmartThings is still linking',
    detail: 'Return to the app; it shows when linking finishes and anything that went wrong.',
  },
  failed: {
    status: 502,
    title: 'SmartThings could not be linked',
    detail: 'Return to the app to see why under Settings, Providers, and try again.',
  },
  cancelled: {
    status: 200,
    title: 'Linking was cancelled',
    detail: 'SmartThings was not linked. Return to the app to try again whenever you like.',
  },
  expired: {
    status: 400,
    title: 'This link has expired',
    detail: 'The sign-in took too long or was already used. Return to the app and start again.',
  },
  malformed: {
    status: 400,
    title: 'Something went wrong',
    detail:
      'SmartThings sent back an answer this page could not read. Return to the app and retry.',
  },
};

export function sendPage(response: ServerResponse, outcome: PageOutcome): void {
  const message = MESSAGES[outcome];
  const html = htmlPage({
    title: `${message.title} - SmartEverything`,
    body: `<p class="brand">SmartEverything</p>
<h1>${message.title}</h1>
<p>${message.detail}</p>`,
  });
  response.writeHead(message.status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  response.end(html);
}
