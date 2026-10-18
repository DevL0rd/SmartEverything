import { once } from 'node:events';
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createProxyServer } from 'http-proxy-3';

describe('http-proxy-3 contract', () => {
  it('relays a request to its target and lets proxyRes edit the response headers', async () => {
    const target = createServer((_req, res) => {
      res.setHeader('x-origin', 'target');
      res.end('relayed');
    });
    target.listen(0, '127.0.0.1');
    await once(target, 'listening');
    const address = target.address();
    if (address === null || typeof address === 'string') throw new Error('target not listening');
    const proxy = createProxyServer({ target: `http://127.0.0.1:${String(address.port)}` });
    proxy.on('proxyRes', (response) => {
      Object.assign(response.headers, { 'x-added': 'proxy' });
    });
    const front = createServer((req, res) => {
      proxy.web(req, res, {}, () => res.end());
    });
    front.listen(0, '127.0.0.1');
    await once(front, 'listening');
    const frontAddress = front.address();
    if (frontAddress === null || typeof frontAddress === 'string')
      throw new Error('front not listening');
    const reply = await fetch(`http://127.0.0.1:${String(frontAddress.port)}/`);
    front.close();
    target.close();
    expect(await reply.text()).toBe('relayed');
    expect(reply.headers.get('x-origin')).toBe('target');
    expect(reply.headers.get('x-added')).toBe('proxy');
  });
});
