import { useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { isNative } from '../design/platform';
import type { AppHref } from './app-href';
import { Button } from './button';
import { focusView } from './focus-request';
import type { IconName } from './icon';
import { Sheet } from './sheet';
import { Text } from './text';
import { UpdateProgress } from './update-progress';

interface UpdateDetailsStatus {
  readonly label: string;
  readonly tone?: 'variant' | 'warning' | 'critical' | undefined;
  readonly progress?: number | undefined;
}

export type UpdateDetailsFooter =
  | {
      readonly kind: 'action';
      readonly label: string;
      readonly onPress: () => void;
      readonly icon?: IconName | undefined;
    }
  | ({ readonly kind: 'status' } & UpdateDetailsStatus)
  | { readonly kind: 'stale' }
  | { readonly kind: 'none' };

interface UpdateDetailsProps {
  readonly title: string;
  readonly target?: string | undefined;
  readonly metadata?: readonly string[] | undefined;
  readonly notes?: string | undefined;
  readonly releaseNotesContent?: ReactNode;
  readonly status?: UpdateDetailsStatus | undefined;
  readonly reviewSource?: AppHref | undefined;
  readonly footer: UpdateDetailsFooter;
  readonly onClose: () => void;
  readonly opener?: RefObject<View | null> | undefined;
  readonly fallbackFocus?: RefObject<View | null> | undefined;
}

const DETAILS_TITLE = 'Update details';
const DETAILS_DETENTS = ['full'] as const;
const WRAP_TEXT = 'min-w-0 web:wrap-anywhere';
const STALE_STATUS = {
  label: 'This update is no longer available. Close details to see the latest update.',
  tone: 'warning',
} as const;

function ReleaseIdentity({
  title,
  target,
  metadata,
}: Pick<UpdateDetailsProps, 'title' | 'target' | 'metadata'>): ReactNode {
  return (
    <View className="gap-1.5">
      {target === undefined ? null : (
        <Text variant="label" tone="variant" className={WRAP_TEXT}>
          {target}
        </Text>
      )}
      <Text variant="title-2" accessibilityRole="header" className={WRAP_TEXT}>
        {title}
      </Text>
      {metadata === undefined || metadata.length === 0 ? null : (
        <Text variant="callout" tone="variant" className={WRAP_TEXT}>
          {metadata.join(' · ')}
        </Text>
      )}
    </View>
  );
}

function ReleaseNotes({
  notes,
  releaseNotesContent,
}: Pick<UpdateDetailsProps, 'notes' | 'releaseNotesContent'>): ReactNode {
  return (
    <View className="gap-3 border-t border-outline-variant pt-4">
      <Text variant="title-3" accessibilityRole="header">
        What’s new
      </Text>
      {releaseNotesContent ??
        (notes === undefined || notes.trim() === '' ? (
          <Text tone="variant">Release notes weren’t provided for this update.</Text>
        ) : (
          <Text selectable className={WRAP_TEXT}>
            {notes}
          </Text>
        ))}
    </View>
  );
}

function DetailsStatus({
  status,
}: {
  readonly status: UpdateDetailsStatus | undefined;
}): ReactNode {
  return (
    <View className="gap-2">
      <View role="status" accessibilityLiveRegion="polite" aria-live="polite">
        {status === undefined ? null : (
          <Text tone={status.tone ?? 'variant'} className={WRAP_TEXT}>
            {status.label}
          </Text>
        )}
      </View>
      {status?.progress === undefined ? null : <UpdateProgress progress={status.progress} />}
    </View>
  );
}

function DetailsFooter({
  footer,
  onClose,
}: Pick<UpdateDetailsProps, 'footer' | 'onClose'>): ReactNode {
  const close = useRef<View>(null);
  const actionNode = useRef<View>(null);
  const action = useCallback((node: View | null): void => {
    const previous = actionNode.current;
    actionNode.current = node;
    if (node !== null || isNative() || !(previous instanceof HTMLElement)) return;
    if (document.activeElement === previous) {
      requestAnimationFrame(() => {
        focusView(close.current);
      });
    }
  }, []);
  return (
    <View className="w-full flex-row flex-wrap justify-end gap-2">
      <Button ref={close} label="Close" variant="text" size="lg" onPress={onClose} />
      {footer.kind === 'action' ? (
        <Button
          ref={action}
          label={footer.label}
          size="lg"
          wrap
          onPress={footer.onPress}
          {...(footer.icon === undefined ? {} : { icon: footer.icon })}
        />
      ) : null}
    </View>
  );
}

function statusOf({ footer, status }: UpdateDetailsProps): UpdateDetailsStatus | undefined {
  if (footer.kind === 'stale') return STALE_STATUS;
  return footer.kind === 'status' ? footer : status;
}

export function UpdateDetails(props: UpdateDetailsProps): ReactNode {
  const { title, target, metadata, notes, reviewSource, footer, onClose, opener, fallbackFocus } =
    props;
  const dismiss = (): void => {
    onClose();
    requestAnimationFrame(() => {
      if (!focusView(opener?.current ?? null)) focusView(fallbackFocus?.current ?? null, true);
    });
  };
  return (
    <Sheet
      open
      reading
      title={DETAILS_TITLE}
      wide
      detents={DETAILS_DETENTS}
      onClose={dismiss}
      footer={<DetailsFooter footer={footer} onClose={dismiss} />}
    >
      <View className="gap-4 py-3">
        <ReleaseIdentity title={title} target={target} metadata={metadata} />
        <ReleaseNotes notes={notes} releaseNotesContent={props.releaseNotesContent} />
        <DetailsStatus status={statusOf(props)} />
        {reviewSource === undefined ? null : (
          <View className="items-start">
            <Button
              label="Review source"
              size="lg"
              variant="text"
              wrap
              href={reviewSource}
              onPress={onClose}
            />
          </View>
        )}
      </View>
    </Sheet>
  );
}
