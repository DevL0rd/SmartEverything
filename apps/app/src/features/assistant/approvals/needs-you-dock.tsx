import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Keyboard, ScrollView, View, useWindowDimensions } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { focusDecisionHeading } from '../../../components/decision-keyboard';
import { Icon } from '../../../components/icon';
import { ReasonLine } from '../../../components/reason-line';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import { DockAnnouncer } from './dock-announcer';
import { DockPager } from './dock-pager';
import { DockScopeContext } from './dock-scope';
import {
  expiredCopy,
  requestNav,
  resolveIndex,
  settleCursor,
  type DockCursorState,
  type RequestNav,
} from './needs-you-model';
import { useDockFocus } from './use-dock-focus';
import { useStaleExit } from './use-stale-exit';

const HEIGHT_SHARE = 0.52;

export interface NeedsRequest {
  readonly id: string;
  readonly title: string;
  readonly needs: string;
  readonly stale: boolean;
  readonly content: ReactNode;
}

export interface NeedsYouDockProps {
  readonly requests: readonly NeedsRequest[];
  readonly machine: string;
  readonly gate: ReactNode | null;
  readonly notice: string | null;
  readonly onDismiss: (id: string) => void;
}

function Collapsed({
  title,
  review,
}: {
  readonly title: string;
  readonly review: () => void;
}): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-2 pl-4 pr-1">
      <Icon name="warning" size={20} tone="warning" />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {title}
      </Text>
      <Button label="Review" variant="text" onPress={review} />
    </View>
  );
}

function StaleCard({
  machine,
  dismiss,
}: {
  readonly machine: string;
  readonly dismiss: () => void;
}): ReactNode {
  return (
    <Banner
      tone="info"
      title={expiredCopy(machine)}
      action={{ label: 'Dismiss', onPress: dismiss }}
    />
  );
}

function Body({
  request,
  machine,
  gate,
  dismiss,
}: {
  readonly request: NeedsRequest;
  readonly machine: string;
  readonly gate: ReactNode | null;
  readonly dismiss: () => void;
}): ReactNode {
  if (gate !== null) return gate;
  return request.stale ? <StaleCard machine={machine} dismiss={dismiss} /> : request.content;
}

interface DockCursor {
  readonly index: number;
  readonly nav: RequestNav;
  readonly change: (id: string) => void;
}

function useDockCursor(ids: readonly string[], headingId: string): DockCursor {
  const key = ids.join('|');
  const [state, setState] = useState<{ readonly key: string; readonly cursor: DockCursorState }>({
    key,
    cursor: { id: null, index: 0 },
  });
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    focusDecisionHeading(headingId);
  }, [state.cursor.id, headingId]);
  if (state.key !== key) setState({ key, cursor: settleCursor(ids, state.cursor) });
  const index = resolveIndex(ids, state.cursor.id, state.cursor.index);
  return {
    index,
    nav: requestNav(ids, index),
    change: (id): void => {
      moved.current = true;
      setState({ key, cursor: { id, index: ids.indexOf(id) } });
    },
  };
}

function Heading({
  title,
  headingId,
  cursor,
}: {
  readonly title: string | undefined;
  readonly headingId: string;
  readonly cursor: DockCursor;
}): ReactNode {
  return (
    <View nativeID={headingId} className="flex-row flex-wrap items-center gap-2 pl-4 pr-1">
      <Icon name="warning" size={20} tone="warning" />
      <Text variant="body-strong" accessibilityRole="header" className="min-w-0 flex-1 py-2">
        {title}
      </Text>
      <DockPager nav={cursor.nav} change={cursor.change} />
    </View>
  );
}

function Expanded({
  requests,
  machine,
  gate,
  notice,
  onDismiss,
  cursor,
  headingId,
  activeBody,
  root,
}: NeedsYouDockProps & {
  readonly cursor: DockCursor;
  readonly headingId: string;
  readonly activeBody: RefObject<View | null>;
  readonly root: RefObject<View | null>;
}): ReactNode {
  const current = requests[cursor.index];
  return (
    <>
      <Heading title={current?.title} headingId={headingId} cursor={cursor} />
      <ScrollView
        className="min-h-0 shrink"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-3 px-4 pb-4"
      >
        {notice === null ? null : <ReasonLine icon="warning" tone="warning" text={notice} />}
        {requests.map((request, position) => (
          <View
            key={request.id}
            ref={position === cursor.index ? activeBody : undefined}
            className={position === cursor.index ? '' : 'hidden'}
          >
            <DockScopeContext.Provider value={{ root, active: position === cursor.index }}>
              <Body
                request={request}
                machine={machine}
                gate={gate}
                dismiss={() => {
                  onDismiss(request.id);
                }}
              />
            </DockScopeContext.Provider>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

export function NeedsYouDock(props: NeedsYouDockProps): ReactNode {
  const { requests, onDismiss } = props;
  const headingId = useId();
  const root = useRef<View>(null);
  const activeBody = useRef<View>(null);
  const { height: windowHeight } = useWindowDimensions();
  const short = useSizeClass().height === 'compact';
  const [expanded, setExpanded] = useState(false);
  const cursor = useDockCursor(
    requests.map((request) => request.id),
    headingId,
  );
  const setInside = useStaleExit(
    requests.filter((request) => request.stale).map((request) => request.id),
    onDismiss,
  );
  useDockFocus(root, activeBody, { onInside: setInside });
  const current = requests[cursor.index];
  if (current === undefined) return null;
  const limit = { maxHeight: windowHeight * HEIGHT_SHARE };
  return (
    <View className="w-full max-w-reading self-center px-gutter pb-2" style={limit}>
      <DockAnnouncer requests={requests} />
      <View
        ref={root}
        role="region"
        aria-label="Needs your approval"
        className="min-h-0 shrink overflow-hidden rounded-lg border border-outline-variant bg-surface-raised elevation-2"
      >
        {short && !expanded ? (
          <Collapsed
            title={current.needs}
            review={() => {
              Keyboard.dismiss();
              setExpanded(true);
            }}
          />
        ) : (
          <Expanded
            {...props}
            cursor={cursor}
            headingId={headingId}
            activeBody={activeBody}
            root={root}
          />
        )}
      </View>
    </View>
  );
}
