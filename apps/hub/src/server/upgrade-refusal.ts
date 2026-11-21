import type { Duplex } from 'node:stream';
import type { ApiError } from '@smarteverything/domain';

export function refuseUpgrade(socket: Duplex, error: ApiError): void {
  const body = JSON.stringify(error.body());
  socket.end(
    `HTTP/1.1 ${String(error.status)} ${error.code}\r\ncontent-type: application/json\r\ncontent-length: ${String(Buffer.byteLength(body))}\r\nconnection: close\r\n\r\n${body}`,
  );
}
