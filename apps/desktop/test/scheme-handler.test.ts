import { describe, expect, it } from 'vitest';
import {
  declaresScheme,
  SCHEME_MIME_TYPE,
  schemeHandlerEntry,
  xdgDataLocations,
} from '../src/scheme-handler.js';

const ENTRY = schemeHandlerEntry(
  'SmartEverything',
  '/home/ann/Apps/SmartEverything-linux-x64/smarteverything',
);

describe('Linux scheme handler entry', () => {
  it('writes a hidden entry that passes the link as %u', () => {
    expect(ENTRY).toBe(
      [
        '[Desktop Entry]',
        'Type=Application',
        'Version=1.0',
        'Name=SmartEverything',
        'Exec=/home/ann/Apps/SmartEverything-linux-x64/smarteverything %u',
        'MimeType=x-scheme-handler/smarteverything;',
        'NoDisplay=true',
        'Terminal=false',
        '',
      ].join('\n'),
    );
  });

  it('quotes an executable path with spaces and escapes percent signs before the field code', () => {
    expect(schemeHandlerEntry('SmartEverything', '/opt/Smart Everything/100%/run')).toContain(
      'Exec="/opt/Smart Everything/100%%/run" %u\n',
    );
  });

  it('declaresScheme reads MimeType in the Desktop Entry group only', () => {
    expect(declaresScheme(ENTRY)).toBe(true);
    expect(SCHEME_MIME_TYPE).toBe('x-scheme-handler/smarteverything');
    expect(
      declaresScheme(
        '[Desktop Entry]\r\nName=Other\r\nMimeType = text/plain; x-scheme-handler/smarteverything ;\r\n',
      ),
    ).toBe(true);
    expect(
      declaresScheme('[Desktop Entry]\nName=Browser\nMimeType=x-scheme-handler/https;\n'),
    ).toBe(false);
    expect(declaresScheme('[Desktop Entry]\nName=Plain\n')).toBe(false);
    expect(
      declaresScheme(
        '[Desktop Entry]\nName=App\n[Desktop Action open]\nMimeType=x-scheme-handler/smarteverything;\n',
      ),
    ).toBe(false);
    expect(declaresScheme('MimeType=x-scheme-handler/smarteverything;\n')).toBe(false);
    expect(
      declaresScheme('[Desktop Entry]\nMimeType=x-scheme-handler/smarteverything-beta;\n'),
    ).toBe(false);
    expect(declaresScheme('[Desktop Entry]\nXMimeType=x-scheme-handler/smarteverything;\n')).toBe(
      false,
    );
  });
});

describe('XDG data locations', () => {
  it('uses the spec defaults when nothing is set', () => {
    expect(xdgDataLocations({}, '/home/ann')).toEqual({
      home: '/home/ann/.local/share',
      directories: ['/usr/local/share', '/usr/share'],
    });
  });

  it('honours absolute settings, ignores relative ones and never counts the data home as a package location', () => {
    expect(
      xdgDataLocations(
        {
          XDG_DATA_HOME: '/data/ann',
          XDG_DATA_DIRS: '/data/ann/:relative/share::/var/lib/flatpak/exports/share:/usr/share',
        },
        '/home/ann',
      ),
    ).toEqual({
      home: '/data/ann',
      directories: ['/var/lib/flatpak/exports/share', '/usr/share'],
    });
    expect(
      xdgDataLocations({ XDG_DATA_HOME: 'relative', XDG_DATA_DIRS: 'relative' }, '/home/ann'),
    ).toEqual({
      home: '/home/ann/.local/share',
      directories: ['/usr/local/share', '/usr/share'],
    });
  });
});
