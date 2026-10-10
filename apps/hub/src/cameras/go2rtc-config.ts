import type { IceServer } from '@smarteverything/domain';

export interface Go2rtcSettings {
  readonly apiPort: number;
  readonly rtspPort: number;
  readonly webrtcPort: number;
  readonly username: string;
  readonly password: string;
  readonly candidates: readonly string[];
  readonly iceServers: readonly IceServer[];
  readonly xiaomi: Readonly<Record<string, string>>;
}

type YamlValue =
  string | number | boolean | readonly YamlValue[] | { readonly [key: string]: YamlValue };

function isList(value: YamlValue): value is readonly YamlValue[] {
  return Array.isArray(value);
}

function yamlLines(value: YamlValue, indent: string): string[] {
  if (isList(value)) {
    return value.flatMap((entry) => {
      const [first = '', ...rest] = yamlLines(entry, `${indent}  `).map((line) =>
        line.slice(indent.length + 2),
      );
      return [`${indent}- ${first}`, ...rest.map((line) => `${indent}  ${line}`)];
    });
  }
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => {
      if (isList(entry) && entry.length === 0) {
        return [`${indent}${key}: []`];
      }
      if (typeof entry === 'object' && Object.keys(entry).length === 0) {
        return [`${indent}${key}: {}`];
      }
      return typeof entry === 'object'
        ? [`${indent}${key}:`, ...yamlLines(entry, `${indent}  `)]
        : [`${indent}${key}: ${JSON.stringify(entry)}`];
    });
  }
  return [`${indent}${JSON.stringify(value)}`];
}

function iceServerValue(server: IceServer): YamlValue {
  return {
    urls: server.urls,
    ...(server.username === undefined ? {} : { username: server.username }),
    ...(server.credential === undefined ? {} : { credential: server.credential }),
  };
}

export function go2rtcConfig(settings: Go2rtcSettings): string {
  const config: YamlValue = {
    api: {
      listen: `127.0.0.1:${String(settings.apiPort)}`,
      username: settings.username,
      password: settings.password,
      local_auth: true,
    },
    rtsp: { listen: `127.0.0.1:${String(settings.rtspPort)}` },
    srtp: { listen: '' },
    webrtc: {
      listen: `:${String(settings.webrtcPort)}`,
      candidates: settings.candidates,
      ice_servers: settings.iceServers.map(iceServerValue),
    },
    xiaomi: settings.xiaomi,
    log: { output: 'stdout', format: 'json', level: 'info' },
  };
  return `${yamlLines(config, '').join('\n')}\n`;
}
