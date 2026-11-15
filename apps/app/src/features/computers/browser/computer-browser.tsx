import type { ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { ErrorState } from '../../../components/error-state';
import type { MenuItem } from '../../../components/menu';
import { Skeleton } from '../../../components/skeleton';
import {
  FileBrowser,
  useBrowserShellParts,
  useBrowserPanels,
  useFileBrowser,
  type BrowserHeader,
  type FileLocation,
} from '../../files';
import type { ComputerReach } from '../data/computer-scopes';
import type { ComputerSource } from '../source/computer-source';
import { paramOfLocation } from './computer-route';
import { useComputerStart, type StartFailure } from './use-computer-start';

export interface ComputerFrameSlots {
  readonly header: BrowserHeader | null;
  readonly overflow: readonly MenuItem[];
  readonly controls: ReactNode;
  readonly detailsOpen: boolean;
  readonly children: ReactNode;
}

export interface ComputerBrowserProps {
  readonly deviceId: string;
  readonly hrefOf: (path: string) => AppHref;
  readonly renderFrame: (slots: ComputerFrameSlots) => ReactNode;
}

export function refusedLineOf(reach: ComputerReach): string {
  return reach.owner
    ? `Files are turned off for ${reach.name}. Turn them on in its Access scopes.`
    : `Ask the person who uses ${reach.name} to turn on Files in its Access scopes.`;
}

export function offlineLineOf(name: string): string {
  return `${name} is offline. These are the files from the last visit.`;
}

export function offlineEmptyLineOf(name: string): string {
  return `${name} is offline. Its files show when it is back.`;
}

const BARE_BODIES: ReadonlySet<string> = new Set(['offline', 'refused']);

interface LoadedProps extends ComputerBrowserProps {
  readonly source: ComputerSource;
  readonly reach: ComputerReach;
  readonly location: FileLocation;
}

function Loaded({
  deviceId,
  source,
  reach,
  location,
  hrefOf,
  renderFrame,
}: LoadedProps): ReactNode {
  const browser = useFileBrowser({
    source,
    location,
    host: {
      hrefOf: (target) => hrefOf(paramOfLocation(target)),
      onOpenFolder: (target) => {
        router.push(hrefOf(paramOfLocation(target)));
      },
      offlineLine: reach.online ? null : offlineLineOf(reach.name),
      offlineEmptyLine: offlineEmptyLineOf(reach.name),
      refusedLine: refusedLineOf(reach),
      ...(reach.owner
        ? {
            refusedAction: {
              label: 'Open Access scopes',
              href: href.settings.device(deviceId, 'scopes'),
            },
          }
        : {}),
    },
  });
  const slots = useBrowserPanels(browser, { from: source.label });
  const shellParts = useBrowserShellParts(browser);
  const { header } = browser;
  const bare = BARE_BODIES.has(browser.body.kind);
  return renderFrame({
    header: browser.abilities.list && !bare ? header : null,
    overflow: bare ? [] : shellParts.overflow,
    controls: bare ? null : shellParts.controls,
    detailsOpen: browser.state.panels.has('details'),
    children: <FileBrowser browser={browser} slots={slots} />,
  });
}

function Waiting({
  renderFrame,
  failure,
}: {
  readonly renderFrame: ComputerBrowserProps['renderFrame'];
  readonly failure: StartFailure | null;
}): ReactNode {
  return renderFrame({
    header: null,
    overflow: [],
    controls: null,
    detailsOpen: false,
    children:
      failure === null ? (
        <Skeleton shape="tile" className="h-64" />
      ) : (
        <ErrorState error={failure.error} retry={failure.retry} />
      ),
  });
}

export function ComputerBrowser(props: ComputerBrowserProps): ReactNode {
  const { path } = useLocalSearchParams<{ path?: string }>();
  const { source, reach, location, failure } = useComputerStart(props.deviceId, path);
  if (location !== null) {
    return <Loaded {...props} source={source} reach={reach} location={location} />;
  }
  return <Waiting renderFrame={props.renderFrame} failure={failure} />;
}
