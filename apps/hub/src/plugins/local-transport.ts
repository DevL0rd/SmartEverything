import { BlockList, isIP } from 'node:net';
import { hostname } from 'node:os';
import type { PluginMcp } from '@smarteverything/domain';
import { interfaceEntries } from '../network/lan';
const loopbacks = new BlockList();
loopbacks.addSubnet('127.0.0.0', 8, 'ipv4');
loopbacks.addAddress('::1', 'ipv6');
loopbacks.addAddress('0.0.0.0', 'ipv4');
loopbacks.addAddress('::', 'ipv6');
function literalLoopback(host: string): boolean {
  const version = isIP(host);
  if (version === 0) return false;
  return loopbacks.check(host, version === 6 ? 'ipv6' : 'ipv4');
}
function sameAddress(left: string, right: string): boolean {
  const version = isIP(left);
  if (version === 0) return left === right;
  const addresses = new BlockList();
  addresses.addAddress(left, version === 6 ? 'ipv6' : 'ipv4');
  return isIP(right) !== 0 && addresses.check(right, isIP(right) === 6 ? 'ipv6' : 'ipv4');
}
function urlHost(url: string): string {
  return new URL(url).hostname.replace(/^\[|\]$/g, '');
}
export function localPluginTransport(mcp: PluginMcp | null, callback: string): boolean {
  if (mcp === null) return false;
  if (mcp.transport === 'stdio') return true;
  const host = urlHost(mcp.url);
  if (
    literalLoopback(host) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === hostname()
  )
    return true;
  const addresses = [urlHost(callback), ...interfaceEntries().map((row) => row.address)];
  return addresses.some((address) => sameAddress(address, host));
}
