import { router, type Href } from 'expo-router';
import type { SearchEntry } from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import { notify } from '../components/toast-store';
import { runSceneNow, toggleAutomation } from '../features/automations';
import { useEntityStore, useLedger } from '../store/store-context';
import type { Device } from '../store/state';
import type { SearchCatalogue } from './catalogue';
import type { ResultNode } from './nodes';
import { useRecentSearches } from './recent';
import { background } from '@smarteverything/logging';

export type InlineAction =
  | { readonly kind: 'power'; readonly device: Device }
  | { readonly kind: 'scene'; readonly sceneId: string; readonly name: string }
  | { readonly kind: 'automation'; readonly automationId: string; readonly enabled: boolean }
  | { readonly kind: 'command'; readonly entry: SearchEntry };

function routineAction(entry: SearchEntry): InlineAction | null {
  if (entry.run?.kind === 'scene') {
    return { kind: 'scene', sceneId: entry.run.sceneId, name: entry.title };
  }
  if (entry.run?.kind === 'automation') {
    return {
      kind: 'automation',
      automationId: entry.run.automationId,
      enabled: !entry.run.enabled,
    };
  }
  return null;
}

export function inlineOf(node: ResultNode, catalogue: SearchCatalogue): InlineAction | null {
  if (node.item.kind === 'phrase') {
    return { kind: 'command', entry: node.item.entry };
  }
  if (node.item.kind !== 'entry') {
    return null;
  }
  const { entry } = node.item;
  if (entry.group === 'scene' || entry.group === 'automation') {
    return routineAction(entry);
  }
  if (entry.group !== 'device' || entry.run?.kind !== 'command') {
    return null;
  }
  const named = catalogue.devices.get(entry.run.deviceId);
  return named?.device.online === true ? { kind: 'power', device: named.device } : null;
}

function linkOf(node: ResultNode, catalogue: SearchCatalogue): Href | undefined {
  if (node.item.kind === 'entry') {
    return catalogue.links.get(node.item.entry.id);
  }
  const named = catalogue.devices.get(node.item.deviceId);
  return node.item.kind === 'capability' && named !== undefined
    ? href.device(named.device)
    : undefined;
}

export interface SearchActions {
  readonly open: (node: ResultNode) => void;
  readonly inline: (node: ResultNode) => void;
}

function useCommand(catalogue: SearchCatalogue): (entry: SearchEntry) => void {
  const ledger = useLedger();
  return (entry): void => {
    const target = entry.run;
    const named = target?.kind === 'command' ? catalogue.devices.get(target.deviceId) : undefined;
    if (target?.kind !== 'command' || named === undefined) {
      return;
    }
    background(
      ledger.send(named.device, target.capability, target.value).then((outcome) => {
        if (outcome.sent) {
          notify({ message: entry.title, tone: 'positive' });
        }
      }),
      'ledger.send_failed',
    );
  };
}

export function useSearchActions(
  catalogue: SearchCatalogue,
  query: string,
  onDone: () => void,
): SearchActions {
  const ledger = useLedger();
  const store = useEntityStore();
  const command = useCommand(catalogue);
  const { note } = useRecentSearches();
  const inline = (node: ResultNode): void => {
    const action = inlineOf(node, catalogue);
    switch (action?.kind) {
      case 'command':
        command(action.entry);
        return;
      case 'scene':
        runSceneNow({ id: action.sceneId, name: action.name });
        return;
      case 'automation':
        toggleAutomation(action.automationId, !action.enabled);
        return;
      case 'power': {
        const power = store.get().deviceValues.get(action.device.id)?.['power']?.value;
        background(ledger.send(action.device, 'power', power !== true), 'ledger.send_failed');
        return;
      }
      case undefined:
        return;
    }
  };
  const open = (node: ResultNode): void => {
    note(query);
    const link = linkOf(node, catalogue);
    if (link === undefined) {
      inline(node);
      return;
    }
    onDone();
    router.navigate(link);
  };
  return { open, inline };
}
