import type { ServerResponse } from 'node:http';
import type { ServerExtension } from '../../extensions';
import { PAGE_STYLE } from '../../server/page-style';

export const PRIVACY_PATH = '/privacy';

const SECTIONS: readonly (readonly [string, string])[] = [
  [
    'Where your data lives',
    'SmartEverything keeps everything on the computer that runs its server: devices, their history, camera clips, automations and the health records your phone sends. Nothing is stored by the people who make SmartEverything.',
  ],
  [
    'Health Connect',
    'With your permission the Android app reads the health records you choose in Health Connect and uploads them, over this server’s address, to your own server. They are used only to show your fitness pages and are never shared or sold.',
  ],
  [
    'Device providers',
    'To control your devices the server talks to Xiaomi, Tuya and Samsung SmartThings with the accounts you link. Their own privacy policies cover what they receive.',
  ],
  [
    'Deleting data',
    'Revoke Health Connect access in Android settings at any time, remove a health source in the app to stop uploads, and delete the server’s data folder to erase everything.',
  ],
];

export function privacyPage(): string {
  const body = SECTIONS.map(([title, text]) => `<h2>${title}</h2>\n<p>${text}</p>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy - SmartEverything</title>
<style>${PAGE_STYLE} main { text-align: left; } h2 { font-size: 17px; margin: 20px 0 6px; }</style>
</head>
<body>
<main>
<p class="brand">SmartEverything</p>
<h1>Privacy</h1>
${body}
</main>
</body>
</html>
`;
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
