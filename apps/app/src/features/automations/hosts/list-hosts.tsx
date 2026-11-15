import { useMemo, type ReactNode } from 'react';
import { Stack, useRouter, type SingularOptions } from 'expo-router';
import { screenPause } from '../../../app-shell/screen-pause';
import { SectionHost } from '../../../app-shell/section-host';
import { useStackOptions } from '../../../app-shell/tab-stack';
import { useRooms } from '../../../store/selectors';
import { AutomationsScreen } from '../list/automations-screen';
import type { ListEnvironment } from '../list/use-list';
import { links } from '../routes';
import { LIST_LINKS } from './host-links';
import { useFunctionLookup, usePlace, useRefNames } from './use-environment';

const NO_UPDATES: ReadonlySet<string> = new Set();

const WORKSPACE_ROUTES: ReadonlySet<string> = new Set([
  'index',
  'nodes/index',
  'templates',
  'runs',
  'variables/index',
  'schedule',
  'scheduled/index',
]);

function idOf(key: string): SingularOptions {
  return (_name, params) => {
    const value = params[key];
    return typeof value === 'string' ? value : undefined;
  };
}

function useListEnvironment(): ListEnvironment {
  const names = useRefNames();
  const functions = useFunctionLookup();
  const place = usePlace();
  const rooms = useRooms();
  const roomNames = useMemo(() => new Map(rooms.map((room) => [room.id, room.name])), [rooms]);
  return useMemo(
    () => ({ names, functions, place, rooms: roomNames, updates: NO_UPDATES }),
    [names, functions, place, roomNames],
  );
}

export function AutomationsIndexHost(): ReactNode {
  const environment = useListEnvironment();
  const router = useRouter();
  return (
    <AutomationsScreen
      environment={environment}
      links={LIST_LINKS}
      onNew={() => {
        router.push(links.create());
      }}
    />
  );
}

export function AutomationsLayoutHost(): ReactNode {
  const options = useStackOptions();
  return (
    <SectionHost>
      <Stack
        initialRouteName="index"
        screenLayout={screenPause}
        screenOptions={({ route }) =>
          WORKSPACE_ROUTES.has(route.name) ? { ...options, animation: 'none' } : options
        }
      >
        <Stack.Screen name="[automationId]/index" dangerouslySingular={idOf('automationId')} />
        <Stack.Screen name="nodes/[functionId]/index" dangerouslySingular={idOf('functionId')} />
        <Stack.Screen name="variables/[variableId]" dangerouslySingular={idOf('variableId')} />
      </Stack>
    </SectionHost>
  );
}
