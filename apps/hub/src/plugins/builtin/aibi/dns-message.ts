import { AIBI_HOST } from './host-name';

const ANSWER_TTL_SECONDS = 30;

const HEADER_BYTES = 12;
const MIN_QUERY_BYTES = 17;
const QUESTION_TAIL_BYTES = 4;
const POINTER_MASK = 0xc0;
const TYPE_A = 1;
const CLASS_IN = 1;
const RESPONSE = 0x8000;
const AUTHORITATIVE = 0x0400;
const RECURSION_DESIRED = 0x0100;
const RECURSION_AVAILABLE = 0x0080;
const SERVER_FAILURE = 2;
const NAME_POINTER = 0xc00c;
const ADDRESS_LENGTH = 4;
const ANSWER_BYTES = 16;

interface Question {
  readonly id: number;
  readonly flags: number;
  readonly name: string;
  readonly type: number;
  readonly classCode: number;
  readonly end: number;
}

function labelsOf(message: Buffer): { readonly labels: string[]; readonly offset: number } | null {
  let offset = HEADER_BYTES;
  const labels: string[] = [];
  while (offset < message.length) {
    const length = message.readUInt8(offset);
    if ((length & POINTER_MASK) !== 0) {
      return null;
    }
    offset += 1;
    if (length === 0) {
      return { labels, offset };
    }
    if (offset + length > message.length) {
      return null;
    }
    labels.push(message.subarray(offset, offset + length).toString('ascii'));
    offset += length;
  }
  return { labels, offset };
}

function questionOf(message: Buffer): Question | null {
  if (message.length < MIN_QUERY_BYTES || message.readUInt16BE(4) < 1) {
    return null;
  }
  const parsed = labelsOf(message);
  if (parsed === null || parsed.offset + QUESTION_TAIL_BYTES > message.length) {
    return null;
  }
  if (parsed.labels.length === 0) {
    return null;
  }
  return {
    id: message.readUInt16BE(0),
    flags: message.readUInt16BE(2),
    name: parsed.labels.join('.').replace(/\.$/, '').toLowerCase(),
    type: message.readUInt16BE(parsed.offset),
    classCode: message.readUInt16BE(parsed.offset + 2),
    end: parsed.offset + QUESTION_TAIL_BYTES,
  };
}

function isOurs(name: string): boolean {
  return name === AIBI_HOST || name.endsWith(`.${AIBI_HOST}`);
}

function headerOf(asked: Question, answers: number): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16BE(asked.id, 0);
  header.writeUInt16BE(
    RESPONSE | (asked.flags & RECURSION_DESIRED) | AUTHORITATIVE | RECURSION_AVAILABLE,
    2,
  );
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(answers, 6);
  return header;
}

function addressRecord(address: string): Buffer {
  const record = Buffer.alloc(ANSWER_BYTES);
  record.writeUInt16BE(NAME_POINTER, 0);
  record.writeUInt16BE(TYPE_A, 2);
  record.writeUInt16BE(CLASS_IN, 4);
  record.writeUInt32BE(ANSWER_TTL_SECONDS, 6);
  record.writeUInt16BE(ADDRESS_LENGTH, 10);
  address.split('.').forEach((part, index) => {
    record.writeUInt8(Number(part), 12 + index);
  });
  return record;
}

export function localAnswer(query: Buffer, address: string): Buffer | null {
  const asked = questionOf(query);
  if (asked === null || !isOurs(asked.name)) {
    return null;
  }
  const wanted = asked.type === TYPE_A && asked.classCode === CLASS_IN;
  const header = headerOf(asked, wanted ? 1 : 0);
  const question = query.subarray(HEADER_BYTES, asked.end);
  return wanted
    ? Buffer.concat([header, question, addressRecord(address)])
    : Buffer.concat([header, question]);
}

export function serverFailure(query: Buffer): Buffer | null {
  if (query.length < HEADER_BYTES) {
    return null;
  }
  const header = Buffer.from(query.subarray(0, HEADER_BYTES));
  header.writeUInt16BE(
    RESPONSE | (query.readUInt16BE(2) & RECURSION_DESIRED) | RECURSION_AVAILABLE | SERVER_FAILURE,
    2,
  );
  header.writeUInt16BE(0, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);
  return Buffer.concat([header, query.subarray(HEADER_BYTES)]);
}
