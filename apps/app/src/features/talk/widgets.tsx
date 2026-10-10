import type { WidgetDefinition } from '../../components/widget-board';
import { talkAvailable } from './data/talk-available';
import { CHANNEL_WIDGET } from './widgets/channel-widget';
import { CHANNELS_WIDGET } from './widgets/channels-widget';

export const TALK_WIDGETS: readonly WidgetDefinition[] = talkAvailable()
  ? [CHANNEL_WIDGET, CHANNELS_WIDGET]
  : [];
