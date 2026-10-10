import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LIVE_SERVER_MESSAGE,
  liveProtocols,
  type LiveServerMessage,
} from '@smarteverything/domain';
import WebSocket from 'ws';

export interface Reply {
  readonly status: number;
  readonly body: unknown;
}

export async function call(
  base: string,
  token: string | null,
  request: { readonly method: string; readonly path: string; readonly body?: unknown },
): Promise<Reply> {
  const response = await fetch(`${base}${request.path}`, {
    method: request.method,
    headers: {
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  });
  const text = await response.text();
  const body: unknown = text === '' ? null : JSON.parse(text);
  return { status: response.status, body };
}

export async function fakeGo2rtcBinary(directory: string): Promise<string> {
  const path = join(directory, 'go2rtc-fake');
  await writeFile(
    path,
    [
      '#!/bin/sh',
      `echo '{"level":"info","message":"[api] listen","addr":"127.0.0.1:1"}'`,
      'exec sleep 600',
    ].join('\n'),
  );
  await chmod(path, 0o700);
  return path;
}

const FAKE_GO2RTC = [
  '#!/usr/bin/env node',
  "const http = require('node:http');",
  "const fs = require('node:fs');",
  'const { WebSocketServer } = require(WS_PATH);',
  "const config = fs.readFileSync(process.argv[3], 'utf8');",
  'const port = Number(/listen: "127\\.0\\.0\\.1:(\\d+)"/.exec(config)[1]);',
  'const replies = {',
  "  'PUT /api/streams': () => '',",
  "  'DELETE /api/streams': () => '',",
  "  'GET /api/frame.jpeg': () => Buffer.from([0xff, 0xd8, 0xff]),",
  "  'GET /api/stream.mp4': () => Buffer.from('0123456789'),",
  '};',
  'const server = http.createServer((request, response) => {',
  "  const key = `${request.method} ${request.url.split('?')[0]}`;",
  "  if (key === 'POST /api/webrtc') {",
  "    let body = '';",
  "    request.on('data', (chunk) => { body += chunk; });",
  "    request.on('end', () => response.end(`answer:${body}`));",
  '    return;',
  '  }',
  '  const reply = replies[key];',
  '  response.statusCode = reply === undefined ? 404 : 200;',
  "  response.end(reply === undefined ? 'unknown' : reply());",
  '});',
  "const sockets = new WebSocketServer({ server, path: '/api/ws' });",
  "sockets.on('connection', (socket) => socket.on('message', (data) => socket.send(`echo:${data}`)));",
  "server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ level: 'info', message: '[api] listen' })));",
  "process.on('SIGTERM', () => process.exit(0));",
].join('\n');

export async function fakeGo2rtcServer(directory: string): Promise<string> {
  const path = join(directory, 'go2rtc-server');
  const ws = JSON.stringify(createRequire(import.meta.url).resolve('ws'));
  await writeFile(path, FAKE_GO2RTC.replace('WS_PATH', ws));
  await chmod(path, 0o700);
  return path;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        resolve(typeof address === 'object' && address !== null ? address.port : 0);
      });
    });
  });
}

export async function temporaryDirectory(): Promise<{ path: string; remove: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), 'hub-server-'));
  return { path, remove: () => rm(path, { recursive: true, force: true }) };
}

export interface LiveClient {
  readonly socket: WebSocket;
  readonly next: (matches: (message: LiveServerMessage) => boolean) => Promise<LiveServerMessage>;
  readonly closed: Promise<number>;
}

export function openLive(base: string, token: string): Promise<LiveClient> {
  const socket = new WebSocket(`${base.replace('http', 'ws')}/live`, [...liveProtocols(token)]);
  const received: LiveServerMessage[] = [];
  const waiters: {
    matches: (message: LiveServerMessage) => boolean;
    resolve: (message: LiveServerMessage) => void;
  }[] = [];
  socket.on('message', (data: Buffer) => {
    const message = LIVE_SERVER_MESSAGE.parse(JSON.parse(data.toString('utf8')));
    const waiter = waiters.find((candidate) => candidate.matches(message));
    if (waiter === undefined) {
      received.push(message);
      return;
    }
    waiters.splice(waiters.indexOf(waiter), 1);
    waiter.resolve(message);
  });
  const closed = new Promise<number>((resolve) => {
    socket.once('close', (code) => {
      resolve(code);
    });
  });
  return new Promise((resolve, reject) => {
    socket.once('open', () => {
      resolve({
        socket,
        closed,
        next: (matches) => {
          const earlier = received.find(matches);
          if (earlier !== undefined) {
            received.splice(received.indexOf(earlier), 1);
            return Promise.resolve(earlier);
          }
          return new Promise((settle) => {
            waiters.push({ matches, resolve: settle });
          });
        },
      });
    });
    socket.once('unexpected-response', (_request, response) => {
      reject(new Error(`live refused with HTTP ${String(response.statusCode)}`));
    });
    socket.once('error', reject);
  });
}
