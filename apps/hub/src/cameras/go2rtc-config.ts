import type { IceServer } from '@smarteverything/domain';
import { stringify } from 'yaml';

export interface Go2rtcSettings {
  readonly apiPort: number;
  readonly rtspPort: number;
  readonly webrtcPort: number;
  readonly username: string;
  readonly password: string;
  readonly candidates: readonly string[];
  readonly iceServers: readonly IceServer[];
  readonly xiaomi: Readonly<Record<string, string>>;
  readonly ffmpegBinary: string;
}

export function go2rtcConfig(settings: Go2rtcSettings): string {
  const config = {
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
      ice_servers: settings.iceServers,
    },
    ffmpeg: { bin: settings.ffmpegBinary },
    xiaomi: settings.xiaomi,
    log: { output: 'stdout', format: 'json', level: 'info' },
  };
  return stringify(config, { lineWidth: 0 });
}
