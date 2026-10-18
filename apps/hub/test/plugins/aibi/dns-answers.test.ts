import { decode, encode } from 'dns-packet';
import { describe, expect, it } from 'vitest';
import { localAnswer, serverFailure } from '../../../src/plugins/builtin/aibi/dns';

const ROBOT_ADDRESS = '192.168.50.2';
const RECURSION_DESIRED = 0x0100;

function query(name: string, type: 'A' | 'AAAA' | 'MX', flags = RECURSION_DESIRED): Buffer {
  return encode({ type: 'query', id: 0x1234, flags, questions: [{ type, name, class: 'IN' }] });
}

describe('AIBI DNS answers', () => {
  it('answers an A query for the AIBI cloud with this server address', () => {
    const answer = localAnswer(query('api.aibipocket.com', 'A'), ROBOT_ADDRESS);
    expect(answer?.readUInt16BE(2)).toBe(0x8580);
    expect(answer?.readUInt16BE(4)).toBe(1);
    expect(answer?.readUInt16BE(6)).toBe(1);
    const parsed = decode(answer ?? Buffer.alloc(0));
    expect(parsed.id).toBe(0x1234);
    expect(parsed.questions).toStrictEqual([
      { name: 'api.aibipocket.com', type: 'A', class: 'IN' },
    ]);
    expect(parsed.answers).toMatchObject([
      { name: 'api.aibipocket.com', type: 'A', class: 'IN', ttl: 30, data: ROBOT_ADDRESS },
    ]);
  });

  it('answers a subdomain and ignores letter case', () => {
    const answer = localAnswer(query('Img.API.AibiPocket.com', 'A'), ROBOT_ADDRESS);
    expect(decode(answer ?? Buffer.alloc(0)).answers).toMatchObject([{ data: ROBOT_ADDRESS }]);
  });

  it('answers other record types for the cloud with an empty authoritative answer', () => {
    const answer = localAnswer(query('api.aibipocket.com', 'AAAA'), ROBOT_ADDRESS);
    expect(answer?.readUInt16BE(2)).toBe(0x8580);
    expect(answer?.readUInt16BE(6)).toBe(0);
  });

  it('answers a record type this library has no name for with an empty answer', () => {
    const raw = query('api.aibipocket.com', 'A');
    raw.writeUInt16BE(65, raw.length - 4);
    const answer = localAnswer(raw, ROBOT_ADDRESS);
    expect(answer?.readUInt16BE(6)).toBe(0);
    expect(decode(answer ?? Buffer.alloc(0)).questions).toHaveLength(1);
  });

  it('copies the recursion-desired bit from the query', () => {
    const answer = localAnswer(query('api.aibipocket.com', 'A', 0), ROBOT_ADDRESS);
    expect(answer?.readUInt16BE(2)).toBe(0x8480);
  });

  it('leaves other names and unreadable packets to the upstream resolver', () => {
    expect(localAnswer(query('example.com', 'A'), ROBOT_ADDRESS)).toBeNull();
    expect(localAnswer(query('notaibipocket.com', 'A'), ROBOT_ADDRESS)).toBeNull();
    expect(localAnswer(Buffer.from([1, 2, 3]), ROBOT_ADDRESS)).toBeNull();
  });

  it('builds a server-failure answer that echoes the question', () => {
    const failure = serverFailure(query('example.com', 'A'));
    expect(failure?.readUInt16BE(2)).toBe(0x8182);
    const parsed = decode(failure ?? Buffer.alloc(0));
    expect(parsed.id).toBe(0x1234);
    expect(parsed.questions).toStrictEqual([{ name: 'example.com', type: 'A', class: 'IN' }]);
    expect(parsed.answers).toStrictEqual([]);
    expect(serverFailure(Buffer.from([1, 2, 3]))).toBeNull();
  });
});
