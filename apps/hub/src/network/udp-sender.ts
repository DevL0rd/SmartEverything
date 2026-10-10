import { createSocket } from 'node:dgram';

export function udpSender(address: string, port: number): (packet: Uint8Array) => Promise<void> {
  return (packet) =>
    new Promise((resolve, reject) => {
      const socket = createSocket('udp4');
      socket.once('error', (cause) => {
        socket.close();
        reject(cause);
      });
      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(packet, port, address, (cause) => {
          socket.close();
          if (cause === null) {
            resolve();
          } else {
            reject(cause);
          }
        });
      });
    });
}
