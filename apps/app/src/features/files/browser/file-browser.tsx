import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useIdiom } from '../../../design/platform';
import { joinParts } from '../../../format/text';
import { itemsLine } from '../source/node';
import { BrowserGrid } from './browser-grid';
import { BrowserList } from './browser-list';
import type { FileBrowserHandle } from './browser-types';
import { layoutOf } from './column-model';
import { DropZone, useDragSession, type DragSession } from './drop-zone';
import { FilterStatus } from './filter-field';
import { keyHintsOf, type KeyHint } from './keys-model';
import { selectionLabelOf } from './selection-model';
import { BrowserSelection } from './selection';
import { BrowserBodyState, OfflineLine } from './states';
import { Toolbar } from './toolbar';

export interface BrowserSlots {
  readonly top?: ReactNode;
  readonly strip?: ReactNode;
  readonly details?: ReactNode;
  readonly quickLook?: ReactNode;
  readonly sheets?: ReactNode;
}

export interface FileBrowserProps<O> {
  readonly browser: FileBrowserHandle<O>;
  readonly slots?: BrowserSlots;
}

function KeyCap({ hint }: { readonly hint: KeyHint }): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      <View className="rounded-xs border border-outline px-1">
        <Text variant="caption" tone="variant">
          {hint.keys}
        </Text>
      </View>
      <Text variant="caption" tone="variant">
        {hint.action}
      </Text>
    </View>
  );
}

function footerLineOf<O>(browser: FileBrowserHandle<O>): string {
  const { listing, visible, picked, total } = browser;
  const hidden = listing.complete && total !== null ? listing.entries.length - total : 0;
  return joinParts([
    total === null ? null : itemsLine(total),
    hidden > 0 ? `${String(hidden)} hidden` : null,
    visible.length === total ? null : `${String(visible.length)} shown`,
    picked.length === 0 ? null : selectionLabelOf(picked.length),
  ]);
}

function Footer<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  if (browser.body.kind !== 'entries') return null;
  const { abilities } = browser;
  const hints = keyHintsOf({
    quickLook: abilities.quickLook.length > 0 && !browser.inTrash,
    details: abilities.details,
    rename: abilities.rename && !browser.inTrash,
  });
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 border-t border-outline-variant px-4 py-2.5">
      <Text
        variant="caption"
        tone="variant"
        numberOfLines={1}
        className="tabular min-w-0 flex-1 basis-48"
      >
        {footerLineOf(browser)}
      </Text>
      {pointer ? hints.map((hint) => <KeyCap key={hint.keys} hint={hint} />) : null}
    </View>
  );
}

interface PartProps<O> {
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
  readonly wide: boolean;
  readonly top: ReactNode;
}

function Listing<O>({ browser, session, wide, top }: PartProps<O>): ReactNode {
  if (browser.body.kind !== 'entries') {
    return (
      <ScrollView contentContainerClassName="gap-3 pb-6">
        {top}
        <BrowserBodyState browser={browser} />
      </ScrollView>
    );
  }
  if (browser.view === 'cards') {
    return <BrowserGrid browser={browser} session={session} header={top} footer={null} />;
  }
  return <BrowserList browser={browser} session={session} wide={wide} header={top} footer={null} />;
}

function Card<O>(props: PartProps<O> & { readonly strip: ReactNode }): ReactNode {
  const { browser, session } = props;
  return (
    <View className="min-h-0 flex-1 overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
      <DropZone browser={browser} session={session}>
        <OfflineLine browser={browser} />
        <FilterStatus browser={browser} />
        <Listing {...props} />
      </DropZone>
      {props.strip}
      <Footer browser={browser} />
    </View>
  );
}

export function FileBrowser<O>({ browser, slots = {} }: FileBrowserProps<O>): ReactNode {
  const measured = useMeasuredWidth();
  const session = useDragSession<O>();
  const wide = layoutOf(measured.width, browser.host.compact === true) === 'table';
  const docked = useIdiom() === 'touch' || !wide;
  const { panels } = browser.state;
  return (
    <View onLayout={measured.onLayout} className="min-h-0 flex-1 gap-3">
      {measured.width === 0 ? null : (
        <>
          <Toolbar browser={browser} session={session} />
          {docked ? null : <BrowserSelection browser={browser} docked={false} />}
          <View className="min-h-0 flex-1 flex-row gap-4">
            <Card
              browser={browser}
              session={session}
              wide={wide}
              top={slots.top ?? null}
              strip={slots.strip ?? null}
            />
            {panels.has('details') ? slots.details : null}
          </View>
          {docked ? <BrowserSelection browser={browser} docked /> : null}
        </>
      )}
      {panels.has('quickLook') ? slots.quickLook : null}
      {slots.sheets}
    </View>
  );
}
