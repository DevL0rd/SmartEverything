import { Fragment, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { OverflowButton } from '../../../components/menu';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import type { FileCrumb } from '../source/types';
import type { FileBrowserHandle } from './browser-types';
import { collapsedCrumbsOf, type CrumbPart } from './crumb-model';
import { useFolderDrop, type DragSession } from './drop-zone';
import { NodeGlyph } from './node-glyph';

interface CrumbProps<O> {
  readonly crumb: FileCrumb<O>;
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
}

function CrumbLabel<O>({
  crumb,
  browser,
  current,
}: {
  readonly crumb: FileCrumb<O>;
  readonly browser: FileBrowserHandle<O>;
  readonly current: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 shrink flex-row items-center gap-1">
      {crumb.leading === undefined ? null : (
        <NodeGlyph node={crumb.leading} source={browser.source} well={null} />
      )}
      <Text
        variant="callout"
        tone={current ? 'default' : 'variant'}
        numberOfLines={1}
        className={cn('min-w-0 shrink', current && 'font-sans-medium')}
      >
        {crumb.label}
      </Text>
    </View>
  );
}

function CrumbButton<O>({ crumb, browser, session }: CrumbProps<O>): ReactNode {
  const ref = useRef<View>(null);
  const [hovering, setHovering] = useState(false);
  const key = crumb.location.folder ?? crumb.location.place;
  useFolderDrop(
    ref,
    {
      browser,
      session,
      target: browser.drag.targetOf(crumb.location, key, !browser.inTrash),
      name: crumb.label,
      enabled: !browser.inTrash,
    },
    setHovering,
  );
  return (
    <View ref={ref} collapsable={false} className={cn('rounded-xs', hovering && 'bg-primary/20')}>
      <Interactive
        label={`Open ${crumb.label}`}
        onPress={() => {
          browser.commands.openLocation(crumb.location);
        }}
        className="min-h-touch-min justify-center rounded-xs px-1"
        layerClassName="rounded-xs"
      >
        <CrumbLabel crumb={crumb} browser={browser} current={false} />
      </Interactive>
    </View>
  );
}

function MoreCrumbs<O>({
  hidden,
  browser,
}: {
  readonly hidden: readonly FileCrumb<O>[];
  readonly browser: FileBrowserHandle<O>;
}): ReactNode {
  return (
    <OverflowButton
      label={`Show ${String(hidden.length)} more folders in the path`}
      items={hidden.map((crumb) => ({
        id: crumb.key,
        label: crumb.label,
        icon: 'folder',
        onPress: (): void => {
          browser.commands.openLocation(crumb.location);
        },
      }))}
    />
  );
}

function Part<O>({
  part,
  browser,
  session,
}: {
  readonly part: CrumbPart<FileCrumb<O>>;
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
}): ReactNode {
  if (part.kind === 'more') return <MoreCrumbs hidden={part.hidden} browser={browser} />;
  if (part.current) {
    return (
      <View className="min-w-0 shrink px-1">
        <CrumbLabel crumb={part.crumb} browser={browser} current />
      </View>
    );
  }
  return <CrumbButton crumb={part.crumb} browser={browser} session={session} />;
}

export function Crumbs<O>({
  browser,
  session,
}: {
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
}): ReactNode {
  const measured = useMeasuredWidth();
  const crumbs = browser.listing.crumbs;
  const parts =
    measured.width === 0 || crumbs.length < 2 ? [] : collapsedCrumbsOf(crumbs, measured.width);
  return (
    <View onLayout={measured.onLayout} className="min-w-0 flex-1">
      <View accessibilityRole="toolbar" aria-label="Path" className="flex-row items-center gap-0.5">
        {parts.map((part, index) => (
          <Fragment key={part.kind === 'more' ? 'more' : part.crumb.key}>
            {index === 0 ? null : <Icon name="chevronRight" size={16} tone="faint" />}
            <Part part={part} browser={browser} session={session} />
          </Fragment>
        ))}
      </View>
    </View>
  );
}
