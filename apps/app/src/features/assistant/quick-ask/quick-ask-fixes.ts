import { router, type Href } from 'expo-router';
import type { Engine } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { ReasonAction } from '../../../components/reason-line';

export type PanelRequest = 'model' | 'device';

export type PanelDestination = (request: PanelRequest) => Href;

export function chatPanel(chatId: string): PanelDestination {
  return (operation) => href.assistantChat(chatId, { operation });
}

export const draftPanel: PanelDestination = (operation) => ({
  pathname: '/assistant',
  params: { operation },
});

export function panelAction(
  label: string,
  request: PanelRequest,
  go: { readonly destination: PanelDestination; readonly close: () => void },
): ReasonAction {
  return {
    label,
    onPress: (): void => {
      go.close();
      router.navigate(go.destination(request));
    },
  };
}

export function engineFixes(
  engine: Engine,
  go: { readonly destination: PanelDestination; readonly close: () => void },
): readonly ReasonAction[] {
  return engine.kind === 'dsh'
    ? [panelAction('Switch machine', 'device', go)]
    : [panelAction('Choose another model', 'model', go)];
}

export function addKeyFix(close: () => void): readonly ReasonAction[] {
  return [
    {
      label: 'Add key',
      onPress: (): void => {
        close();
        router.navigate(href.assistantChat());
      },
    },
  ];
}
