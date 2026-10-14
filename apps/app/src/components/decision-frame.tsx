import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Button } from './button';
import { IconButton } from './icon-button';
import { Text } from './text';
import { focusDecisionHeading } from './decision-keyboard';
export interface DecisionRequest {
  readonly id: string;
  readonly content: ReactNode;
}
function Navigation({
  requests,
  index,
  change,
}: {
  readonly requests: readonly DecisionRequest[];
  readonly index: number;
  readonly change: (id: string) => void;
}): ReactNode {
  if (requests.length <= 1) return null;
  const move = (position: number): void => {
    const item = requests[position];
    if (item !== undefined) change(item.id);
  };
  return (
    <View className="flex-row gap-1">
      <IconButton
        icon="chevronLeft"
        label="Previous request"
        disabled={index === 0}
        onPress={() => {
          move(index - 1);
        }}
      />
      <IconButton
        icon="chevronRight"
        label="Next request"
        disabled={index === requests.length - 1}
        onPress={() => {
          move(index + 1);
        }}
      />
    </View>
  );
}
interface FrameProps {
  readonly source: string;
  readonly requests: readonly DecisionRequest[];
  readonly unavailable: string | null;
  readonly retry?: () => void;
}
function useNavigation(requests: readonly DecisionRequest[]): {
  readonly index: number;
  readonly id: string;
  readonly change: (value: string) => void;
} {
  const [active, setActive] = useState<string | null>(null);
  const id = useId();
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) focusDecisionHeading(id);
    requested.current = false;
  }, [active, id]);
  const change = (value: string): void => {
    requested.current = true;
    setActive(value);
  };
  return {
    index: Math.max(
      0,
      requests.findIndex((request) => request.id === active),
    ),
    id,
    change,
  };
}
export function DecisionFrame({ source, requests, unavailable, retry }: FrameProps): ReactNode {
  const { index, id, change } = useNavigation(requests);
  const { height } = useWindowDimensions();
  const limit = { maxHeight: height * 0.52 };
  if (requests.length === 0) return null;
  return (
    <View className="w-full max-w-reading self-center px-gutter pb-2" style={limit}>
      <View className="min-h-0 shrink overflow-hidden rounded-lg border border-outline-variant bg-surface-1">
        <View className="flex-row flex-wrap items-center gap-2 px-4 py-2">
          <Text variant="caption" tone="variant" className="min-w-0 flex-1">
            {source}
            {requests.length > 1
              ? ` · Request ${String(index + 1)} of ${String(requests.length)}`
              : ''}
          </Text>
          <Navigation requests={requests} index={index} change={change} />
        </View>
        <ScrollView
          className="min-h-0 shrink"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-3 px-4 pb-4"
        >
          <Unavailable reason={unavailable} retry={retry} />
          {requests.map((request, position) => (
            <View
              key={request.id}
              nativeID={position === index ? id : undefined}
              className={position === index ? '' : 'hidden'}
            >
              {request.content}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
export function DecisionStatus({
  pending,
  received,
  error,
}: {
  readonly pending: boolean;
  readonly received: boolean;
  readonly error: Error | null;
}): ReactNode {
  return (
    <View role="status" accessibilityLiveRegion="polite" aria-live="polite" className="gap-1">
      {pending ? (
        <Text tone="variant">Sending…</Text>
      ) : received ? (
        <Text tone="variant">Answer received · waiting for the request to close</Text>
      ) : null}
      {error === null ? null : <Text tone="critical">{error.message}</Text>}
    </View>
  );
}

function Unavailable({
  reason,
  retry,
}: {
  readonly reason: string | null;
  readonly retry: (() => void) | undefined;
}): ReactNode {
  if (reason === null) return null;
  return (
    <View className="gap-2">
      <Text tone="warning" accessibilityLiveRegion="polite">
        {reason}
      </Text>
      {retry === undefined ? null : (
        <Button label="Refresh requests" size="lg" variant="text" onPress={retry} />
      )}
    </View>
  );
}
