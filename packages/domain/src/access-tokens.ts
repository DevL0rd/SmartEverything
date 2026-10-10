import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';

export const MCP_TOKEN = z.string().regex(/^mcp_[0-9a-f]{64}$/);

export function createMcpToken(): string {
  return `mcp_${bytesToHex(randomBytes(32))}`;
}

export function hashMcpToken(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(MCP_TOKEN.parse(token))));
}
