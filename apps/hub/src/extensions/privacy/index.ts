import type { ServerResponse } from 'node:http';
import type { ServerExtension } from '../../extensions';
import { PAGE_STYLE, htmlPage } from '../../server/page-style';
import { PRIVACY_SECTIONS } from './sections';

export const PRIVACY_PATH = '/privacy';

export function privacyPage(): string {
  const body = PRIVACY_SECTIONS.map(
    ({ title, paragraphs }) =>
      `<h2>${title}</h2>\n${paragraphs.map((text) => `<p>${text}</p>`).join('\n')}`,
  ).join('\n');
  return htmlPage({
    title: 'Privacy - SmartEverything',
    body: `<p class="brand">SmartEverything</p>
<h1>Privacy</h1>
${body}`,
    style: `${PAGE_STYLE} main { text-align: left; } h2 { font-size: 17px; margin: 20px 0 6px; }`,
  });
}

function send(response: ServerResponse): void {
  const html = privacyPage();
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    'cache-control': 'public, max-age=3600',
    'referrer-policy': 'no-referrer',
  });
  response.end(html);
}

export function privacyExtension(): ServerExtension {
  return () =>
    Promise.resolve({
      endpoints: {},
      routes: [
        {
          method: 'GET',
          path: PRIVACY_PATH,
          handle: (_request, response): Promise<void> => {
            send(response);
            return Promise.resolve();
          },
        },
      ],
      stop: () => Promise.resolve(),
    });
}
