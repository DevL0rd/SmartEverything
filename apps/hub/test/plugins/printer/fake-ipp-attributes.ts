import { attribute, ipp, type IppAttribute } from '@smarteverything/ipp';
import { DEFAULT_OPERATIONS, text, type FakeOptions, type FakeState } from './fake-ipp-state';

function supplyAttributes(state: FakeState): IppAttribute[] {
  return [
    attribute(
      'printer-supply',
      ...state.supplies.map((supply, index) => ({
        kind: 'octets' as const,
        tag: 0x30,
        value: Buffer.from(
          `index=${String(index + 1)};class=${supply.cls};type=${supply.type};unit=percent;maxcapacity=100;level=${String(supply.level)};colorantname=${supply.colorant};`,
        ),
      })),
    ),
    attribute(
      'printer-supply-description',
      ...state.supplies.map((supply) => ipp.text(supply.name)),
    ),
  ];
}

function alertAttributes(state: FakeState): IppAttribute[] {
  if (state.alerts.length === 0) return [];
  return [
    attribute(
      'printer-alert',
      ...state.alerts.map((code, index) => ({
        kind: 'octets' as const,
        tag: 0x30,
        value: Buffer.from(
          `index=${String(index + 1)};severity=warning;training=untrained;group=inputTray;groupindex=1;code=${code};`,
        ),
      })),
    ),
    attribute('printer-alert-description', ...state.alerts.map((code) => ipp.text(code))),
  ];
}

function liveAttributes(state: FakeState): IppAttribute[] {
  const attributes: IppAttribute[] = [
    attribute('printer-state', ipp.enumeration(state.state)),
    attribute(
      'printer-state-reasons',
      ...(state.reasons.length === 0 ? ['none'] : state.reasons).map((reason) =>
        ipp.keyword(reason),
      ),
    ),
    text('printer-state-message', state.state === 3 ? 'Idle.' : 'Busy.'),
    attribute('printer-is-accepting-jobs', ipp.boolean(state.accepting)),
    attribute('queued-job-count', ipp.integer(state.jobs.filter((job) => job.state < 7).length)),
    attribute('printer-up-time', ipp.integer(state.upTime)),
    attribute('printer-state-change-time', ipp.integer(state.stateChangeTime)),
    attribute('printer-config-change-time', ipp.integer(state.configChangeTime)),
    attribute('marker-change-time', ipp.integer(state.markerChangeTime)),
    ...supplyAttributes(state),
    ...alertAttributes(state),
    attribute('printer-input-tray', {
      kind: 'octets',
      tag: 0x30,
      value: Buffer.from(
        `type=sheetFeedAutoRemovableTray;maxcapacity=100;level=${String(state.trayLevel)};status=0;name=main`,
      ),
    }),
    attribute('media-ready', ipp.keyword('iso_a4_210x297mm')),
  ];
  if (state.pages !== null) {
    attributes.push(attribute('printer-pages-completed', ipp.integer(state.pages)));
  }
  return attributes;
}

function identityAttributes(state: FakeState, options: FakeOptions, url: string): IppAttribute[] {
  const authenticated = options.auth !== undefined && options.auth !== null;
  return [
    attribute('printer-name', ipp.name(state.name)),
    attribute('printer-uuid', ipp.uri(`urn:uuid:${state.uuid}`)),
    text('printer-make-and-model', 'Acme Hall 3000'),
    attribute('printer-device-id', ipp.text('MFG:Acme;MDL:Hall 3000;CMD:PWG;')),
    attribute('printer-location', ipp.text('Hall')),
    attribute('printer-more-info', ipp.uri('http://127.0.0.1/')),
    attribute('printer-uri-supported', ipp.uri(url)),
    attribute('uri-authentication-supported', ipp.keyword(authenticated ? 'basic' : 'none')),
    attribute('uri-security-supported', ipp.keyword(options.secure === true ? 'tls' : 'none')),
    attribute('ipp-versions-supported', ipp.keyword('1.1'), ipp.keyword('2.0')),
    attribute('ipp-features-supported', ipp.keyword('ipp-everywhere')),
  ];
}

function capabilityAttributes(options: FakeOptions): IppAttribute[] {
  const supported = options.operations ?? DEFAULT_OPERATIONS;
  const formats = options.formats ?? ['application/pdf', 'image/jpeg', 'image/pwg-raster'];
  return [
    attribute('operations-supported', ...supported.map((code) => ipp.enumeration(code))),
    attribute('document-format-supported', ...formats.map((format) => ipp.mimeType(format))),
    attribute('color-supported', ipp.boolean(true)),
    attribute('pages-per-minute', ipp.integer(12)),
    attribute('sides-supported', ipp.keyword('one-sided'), ipp.keyword('two-sided-long-edge')),
    attribute('print-color-mode-supported', ipp.keyword('color'), ipp.keyword('monochrome')),
    attribute(
      'print-quality-supported',
      ipp.enumeration(3),
      ipp.enumeration(4),
      ipp.enumeration(5),
    ),
    attribute(
      'media-supported',
      ipp.keyword('iso_a4_210x297mm'),
      ipp.keyword('na_letter_8.5x11in'),
    ),
    attribute('copies-supported', ipp.range(1, 99)),
    attribute('identify-actions-supported', ipp.keyword('flash'), ipp.keyword('sound')),
    attribute('sides-default', ipp.keyword('one-sided')),
  ];
}

export function printerAttributes(
  state: FakeState,
  options: FakeOptions,
  url: string,
  operation: Readonly<Record<string, unknown>>,
): IppAttribute[] {
  const live = liveAttributes(state);
  const requested = operation['requested-attributes'];
  if (requested !== 'all' && !Array.isArray(requested)) return live;
  return [...live, ...identityAttributes(state, options, url), ...capabilityAttributes(options)];
}
