import { useEffect, type ReactNode } from 'react';
import { href } from '../../app-shell/hrefs';
import type { IconName } from '../../components/icon';
import { Text } from '../../components/text';
import { WidgetFrame, type BoardClass, type WidgetSize } from '../../components/widget-board';
import type { ColourRole } from '../../design/tokens';
import type { Device } from '../../store/state';
import { LogTally } from '../../design/log-tally';
import { pluginLog } from './plugin-log';
import type { PluginStream } from './use-plugin-stream';

const widgetTally = new LogTally(pluginLog, 'plugin_widget.summary', 10_000);

export const PLUGIN_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'XL'],
  expanded: ['M', 'W', 'XL'],
};

interface PluginWidgetFrameProps<T> {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly size: WidgetSize;
  readonly device: Device | null;
  readonly stream: PluginStream<T>;
  readonly unavailable: (value: T) => string | null;
  readonly action?: ReactNode;
  readonly children: (value: T) => ReactNode;
}

function Line({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={3}>
      {text}
    </Text>
  );
}

function Body<T>({
  stream,
  unavailable,
  children,
}: Pick<PluginWidgetFrameProps<T>, 'stream' | 'unavailable' | 'children'>): ReactNode {
  switch (stream.state) {
    case 'waiting':
      return <Line text="Waiting for the first reading…" />;
    case 'invalid':
      return <Line text="This widget could not read the latest data." />;
    case 'ready': {
      const reason = unavailable(stream.value);
      return reason === null ? children(stream.value) : <Line text={reason} />;
    }
  }
}

export function PluginWidgetFrame<T>({
  title,
  icon,
  accent,
  size,
  device,
  stream,
  unavailable,
  action,
  children,
}: PluginWidgetFrameProps<T>): ReactNode {
  useEffect(() => {
    widgetTally.bump(`${title}:${size}:mounted`);
    return (): void => {
      widgetTally.bump(`${title}:${size}:unmounted`);
    };
  }, [title, size]);
  const link = device === null ? {} : { href: href.device(device) };
  return (
    <WidgetFrame title={title} icon={icon} accent={accent} action={action} {...link}>
      <Body stream={stream} unavailable={unavailable}>
        {children}
      </Body>
    </WidgetFrame>
  );
}
