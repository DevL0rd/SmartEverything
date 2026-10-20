import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeMessage } from '../src/decode';
import { encodeMessage } from '../src/encode';
import { IppDecodeError, IppEncodeError } from '../src/errors';
import type { IppAttribute, IppValue } from '../src/model';
import { plainObject } from '../src/plain';
import { GROUP_TAG } from '../src/tags';
import { attribute, ipp } from '../src/values';
import { GET_PRINTER_ATTRIBUTES_REQUEST } from './fixtures/gpa-request';
import { GET_PRINTER_ATTRIBUTES_RESPONSE } from './fixtures/gpa-response';
import { bytesOf, messageOf, SAMPLE_ATTRIBUTES } from './helpers';

function sameGroups(bytes: Uint8Array): Uint8Array {
  return encodeMessage(decodeMessage(bytes));
}

describe('IPP codec against messages a printer produced', () => {
  it('decodes the request the research sent to the reference printer', () => {
    const message = decodeMessage(bytesOf(GET_PRINTER_ATTRIBUTES_REQUEST));
    expect(message).toMatchObject({ major: 1, minor: 1, code: 0x000b, requestId: 1 });
    const names = message.groups[0]?.attributes.map((entry) => entry.name);
    expect(names).toEqual([
      'attributes-charset',
      'attributes-natural-language',
      'printer-uri',
      'requested-attributes',
    ]);
    expect(message.groups[0]?.attributes[3]?.values).toEqual([
      ipp.keyword('all'),
      ipp.keyword('media-col-database'),
    ]);
  });

  it('writes the same bytes back for the request it decoded', () => {
    const bytes = bytesOf(GET_PRINTER_ATTRIBUTES_REQUEST);
    expect(sameGroups(bytes)).toEqual(bytes);
  });

  it('decodes the full Get-Printer-Attributes response with its collections', () => {
    const message = decodeMessage(bytesOf(GET_PRINTER_ATTRIBUTES_RESPONSE));
    expect(message.code).toBe(0);
    const printer = message.groups.find((group) => group.tag === GROUP_TAG.printer);
    const byName = new Map(printer?.attributes.map((entry) => [entry.name, entry.values]));
    expect(byName.get('printer-state')).toEqual([ipp.enumeration(3)]);
    expect(byName.get('printer-uuid')).toEqual([
      ipp.uri('urn:uuid:5ea8558e-a16f-3ee9-703c-df37e677edab'),
    ]);
    expect(byName.get('media-col-database')).toHaveLength(5);
    expect(byName.get('printer-resolution-default')).toEqual([
      { kind: 'resolution', x: 600, y: 600, units: 3 },
    ]);
    expect(byName.get('copies-supported')).toEqual([ipp.range(1, 999)]);
  });

  it('writes the same bytes back for the whole response', () => {
    const bytes = bytesOf(GET_PRINTER_ATTRIBUTES_RESPONSE);
    expect(sameGroups(bytes)).toEqual(bytes);
  });
});

describe('IPP codec round trips', () => {
  it('keeps every value kind, 1setOf values and nested collections', () => {
    const message = messageOf(...SAMPLE_ATTRIBUTES);
    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('keeps document data after the end tag', () => {
    const message = {
      ...messageOf(attribute('a', ipp.integer(1))),
      data: Uint8Array.of(1, 2, 3, 0x03),
    };
    expect(decodeMessage(encodeMessage(message)).data).toEqual(Uint8Array.of(1, 2, 3, 0x03));
  });

  it('keeps several groups in order', () => {
    const message = {
      ...messageOf(),
      groups: [
        { tag: GROUP_TAG.operation, attributes: [attribute('a', ipp.integer(1))] },
        { tag: GROUP_TAG.job, attributes: [attribute('b', ipp.integer(2))] },
        { tag: GROUP_TAG.job, attributes: [attribute('b', ipp.integer(3))] },
      ],
    };
    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('grows its buffer for large documents', () => {
    const message = {
      ...messageOf(attribute('a', ipp.integer(1))),
      data: new Uint8Array(100_000).fill(7),
    };
    expect(decodeMessage(encodeMessage(message)).data).toHaveLength(100_000);
  });

  const value: fc.Arbitrary<IppValue> = fc.oneof(
    fc.integer({ min: -2_147_483_648, max: 2_147_483_647 }).map(ipp.integer),
    fc.integer({ min: -100, max: 100 }).map(ipp.enumeration),
    fc.boolean().map(ipp.boolean),
    fc.string({ maxLength: 40 }).map(ipp.keyword),
    fc.string({ maxLength: 40 }).map(ipp.text),
    fc.string({ maxLength: 40 }).map(ipp.name),
    fc.tuple(fc.integer(), fc.integer()).map(([lower, upper]) => ipp.range(lower, upper)),
    fc
      .uint8Array({ maxLength: 20 })
      .map((bytes): IppValue => ({ kind: 'octets', tag: 0x30, value: bytes })),
    fc
      .date({ min: new Date('1971-01-01'), max: new Date('2999-01-01'), noInvalidDate: true })
      .map((date): IppValue => ({
        kind: 'dateTime',
        value: new Date(Math.floor(date.getTime() / 100) * 100).toISOString(),
      })),
  );
  const attributeArb: fc.Arbitrary<IppAttribute> = fc
    .tuple(
      fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/u),
      fc.array(value, { minLength: 1, maxLength: 4 }),
    )
    .map(([name, values]) => ({ name, values }));

  it('decodes whatever it encodes', () => {
    fc.assert(
      fc.property(fc.array(attributeArb, { maxLength: 8 }), (attributes) => {
        const message = messageOf(...attributes);
        expect(decodeMessage(encodeMessage(message))).toEqual(message);
      }),
    );
  });
});

describe('IPP decoding refuses malformed messages by name', () => {
  const good = encodeMessage(messageOf(attribute('printer-state', ipp.enumeration(3))));

  it('rejects a message shorter than a header', () => {
    expect(() => decodeMessage(Uint8Array.of(1, 1))).toThrow(IppDecodeError);
  });

  it('rejects a message cut inside an attribute', () => {
    expect(() => decodeMessage(good.subarray(0, good.length - 6))).toThrow(/expected/u);
  });

  it('rejects a message whose end tag is missing', () => {
    expect(() => decodeMessage(good.subarray(0, good.length - 1))).toThrow(IppDecodeError);
  });

  it('rejects a value tag where a group delimiter belongs', () => {
    expect(() => decodeMessage(Uint8Array.of(1, 1, 0, 0, 0, 0, 0, 1, 0x21))).toThrow(
      /group delimiter/u,
    );
  });

  it('rejects an additional value before any named attribute', () => {
    const bytes = Uint8Array.of(1, 1, 0, 0, 0, 0, 0, 1, 0x01, 0x21, 0, 0, 0, 4, 0, 0, 0, 1, 0x03);
    expect(() => decodeMessage(bytes)).toThrow(/additional value/u);
  });

  it('rejects an integer of the wrong length', () => {
    const bytes = Uint8Array.of(1, 1, 0, 0, 0, 0, 0, 1, 0x01, 0x21, 0, 1, 0x61, 0, 2, 0, 1, 0x03);
    expect(() => decodeMessage(bytes)).toThrow(/an integer/u);
  });

  it('rejects a collection member that is not a member name', () => {
    const bytes = Uint8Array.of(
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0x01,
      0x34,
      0,
      1,
      0x61,
      0,
      0,
      0x21,
      0,
      0,
      0,
      0,
      0x03,
    );
    expect(() => decodeMessage(bytes)).toThrow(/member name/u);
  });

  it('rejects a member name that carries a name', () => {
    const bytes = Uint8Array.of(
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0x01,
      0x34,
      0,
      1,
      0x61,
      0,
      0,
      0x4a,
      0,
      1,
      0x62,
      0,
      0,
      0x03,
    );
    expect(() => decodeMessage(bytes)).toThrow(/empty name before a member name/u);
  });

  it('rejects a member value that carries a name', () => {
    const bytes = Uint8Array.of(
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0x01,
      0x34,
      0,
      1,
      0x61,
      0,
      0,
      0x4a,
      0,
      0,
      0,
      1,
      0x62,
      0x21,
      0,
      1,
      0x63,
      0,
      4,
      0,
      0,
      0,
      1,
      0x03,
    );
    expect(() => decodeMessage(bytes)).toThrow(/empty name inside a collection/u);
  });

  it('reads several values of one collection member', () => {
    const message = messageOf(
      attribute('c', ipp.collection([attribute('m', ipp.integer(1), ipp.integer(2))])),
    );
    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('turns an unset printer clock into an unknown value', () => {
    const base = encodeMessage(
      messageOf(attribute('t', { kind: 'dateTime', value: '2026-10-18T05:35:26.000Z' })),
    );
    const zeroed = base.slice();
    const monthAt = base.indexOf(0x31) + 1 + 2 + 1 + 2 + 2;
    zeroed[monthAt] = 0;
    expect(decodeMessage(zeroed).groups[0]?.attributes[0]?.values).toEqual([
      { kind: 'outOfBand', value: 'unknown' },
    ]);
  });

  it('applies the sign of a time zone offset', () => {
    const base = encodeMessage(
      messageOf(attribute('t', { kind: 'dateTime', value: '2026-10-18T05:00:00.000Z' })),
    );
    const shifted = base.slice();
    const end = shifted.length - 1;
    shifted[end - 3] = '-'.charCodeAt(0);
    shifted[end - 2] = 2;
    shifted[end - 1] = 30;
    expect(decodeMessage(shifted).groups[0]?.attributes[0]?.values).toEqual([
      { kind: 'dateTime', value: '2026-10-18T07:30:00.000Z' },
    ]);
  });

  it('reads resolutions in dots per centimetre', () => {
    const message = messageOf(attribute('r', { kind: 'resolution', x: 118, y: 118, units: 4 }));
    expect(plainObject(decodeMessage(encodeMessage(message)).groups[0]?.attributes ?? [])).toEqual({
      r: { x: 118, y: 118, units: 'dpcm' },
    });
  });

  it('reads text and names that carry a language', () => {
    const language = [0, 2, 0x65, 0x6e, 0, 2, 0x68, 0x69];
    const bytes = Uint8Array.of(
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0x01,
      0x35,
      0,
      1,
      0x61,
      0,
      8,
      ...language,
      0x36,
      0,
      1,
      0x62,
      0,
      8,
      ...language,
      0x03,
    );
    expect(decodeMessage(bytes).groups[0]?.attributes).toEqual([
      attribute('a', ipp.text('hi')),
      attribute('b', ipp.name('hi')),
    ]);
  });

  it('rejects a language text that is cut short', () => {
    const tooShort = Uint8Array.of(
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0x01,
      0x35,
      0,
      1,
      0x61,
      0,
      2,
      0,
      0,
      0x03,
    );
    expect(() => decodeMessage(tooShort)).toThrow(/language and a text/u);
    const cut = Uint8Array.of(
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0x01,
      0x35,
      0,
      1,
      0x61,
      0,
      4,
      0,
      9,
      0,
      0,
      0x03,
    );
    expect(() => decodeMessage(cut)).toThrow(/text after its language/u);
  });
});

describe('IPP encoding refuses what cannot be written', () => {
  it('rejects a value above 65535 bytes', () => {
    expect(() => encodeMessage(messageOf(attribute('a', ipp.text('x'.repeat(70_000)))))).toThrow(
      IppEncodeError,
    );
  });

  it('rejects an attribute without values', () => {
    expect(() => encodeMessage(messageOf({ name: 'empty', values: [] }))).toThrow(
      /at least one value/u,
    );
  });

  it('rejects a timestamp that is not a date', () => {
    expect(() =>
      encodeMessage(messageOf(attribute('t', { kind: 'dateTime', value: 'yesterday' }))),
    ).toThrow(/ISO 8601/u);
  });
});
