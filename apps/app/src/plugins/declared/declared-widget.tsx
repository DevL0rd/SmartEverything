import type { PluginId, WidgetBody } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { IconName } from '../../components/icon';
import { WidgetFrame, type WidgetSize } from '../../components/widget-board';
import { BodyView } from './body-view';

export function DeclaredWidget({
  pluginId,
  title,
  icon,
  body,
  size,
}: {
  readonly pluginId: PluginId;
  readonly title: string;
  readonly icon: IconName;
  readonly body: WidgetBody;
  readonly size: WidgetSize;
}): ReactNode {
  return (
    <WidgetFrame title={title} icon={icon} accent="primary">
      <BodyView pluginId={pluginId} body={body} size={size} />
    </WidgetFrame>
  );
}
