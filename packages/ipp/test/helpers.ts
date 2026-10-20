import { attribute, ipp } from '../src/values';
import type { IppAttribute, IppMessage } from '../src/model';
import { GROUP_TAG } from '../src/tags';

export function bytesOf(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

export function messageOf(...attributes: readonly IppAttribute[]): IppMessage {
  return {
    major: 2,
    minor: 0,
    code: 0,
    requestId: 7,
    groups: [{ tag: GROUP_TAG.printer, attributes }],
    data: new Uint8Array(0),
  };
}

export const SAMPLE_ATTRIBUTES: readonly IppAttribute[] = [
  attribute('printer-state', ipp.enumeration(3)),
  attribute('printer-name', ipp.name('Office')),
  attribute('printer-info', ipp.text('Hallway')),
  attribute('queued-job-count', ipp.integer(-4)),
  attribute('color-supported', ipp.boolean(true)),
  attribute('copies-supported', ipp.range(1, 99)),
  attribute('printer-state-reasons', ipp.keyword('none'), ipp.keyword('media-low-warning')),
  attribute('printer-resolution-default', { kind: 'resolution', x: 600, y: 1200, units: 3 }),
  attribute('printer-current-time', { kind: 'dateTime', value: '2026-10-18T05:35:26.300Z' }),
  attribute(
    'printer-uri-supported',
    ipp.uri('ipp://host/ipp/print'),
    ipp.uri('ipps://host/ipp/print'),
  ),
  attribute(
    'media-col-default',
    ipp.collection([
      attribute(
        'media-size',
        ipp.collection([
          attribute('x-dimension', ipp.integer(21590)),
          attribute('y-dimension', ipp.integer(27940)),
        ]),
      ),
      attribute('media-type', ipp.keyword('stationery'), ipp.keyword('envelope')),
    ]),
  ),
  attribute(
    'media-col-ready',
    ipp.collection([attribute('a', ipp.integer(1))]),
    ipp.collection([attribute('a', ipp.integer(2))]),
  ),
  attribute('x-octets', { kind: 'octets', tag: 0x30, value: Uint8Array.of(1, 2, 3) }),
  attribute('x-unknown-tag', { kind: 'octets', tag: 0x60, value: Uint8Array.of(9) }),
  attribute('printer-geo-location', { kind: 'outOfBand', value: 'unknown' }),
  attribute('x-none', { kind: 'outOfBand', value: 'no-value' }),
  attribute('x-unsupported', { kind: 'outOfBand', value: 'unsupported' }),
  attribute('charset-configured', ipp.charset('utf-8')),
  attribute('natural-language-configured', ipp.language('en')),
  attribute('document-format-default', ipp.mimeType('application/pdf')),
  attribute('reference-uri-schemes-supported', { kind: 'uriScheme', value: 'http' }),
  attribute('printer-dns-sd-name', ipp.name('Prüfer ✓')),
];
