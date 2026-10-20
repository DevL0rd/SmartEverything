import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  Stack,
  useGlobalSearchParams,
  usePathname,
  useRouter,
  type SingularOptions,
} from 'expo-router';
import { screenPause } from '../../../app-shell/screen-pause';
import { useStackOptions } from '../../../app-shell/tab-stack';
import { MasterDetail } from '../../../components/master-detail';
import { useSizeClass } from '../../../design/size-class';
import { useRooms } from '../../../store/selectors';
import { AutomationsScreen } from '../list/automations-screen';
import { AutomationsMaster, AutomationsOverviewPane } from '../list/master';
import type { ListEnvironment } from '../list/use-list';
import { links } from '../routes';
import { isEditorPath, LIST_LINKS } from './host-links';
import { useFunctionLookup, usePlace, useRefNames } from './use-environment';

const NO_UPDATES: ReadonlySet<string> = new Set();

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

function useCreate(): () => void {
  const router = useRouter();
  return () => {
    router.push(links.create());
  };
}

export function AutomationsMasterHost(): ReactNode {
  const environment = useListEnvironment();
  const onNew = useCreate();
  const { automationId } = useGlobalSearchParams<{ automationId?: string }>();
  return (
    <AutomationsMaster
      environment={environment}
      links={LIST_LINKS}
      onNew={onNew}
      selectedId={automationId ?? null}
    />
  );
}

export function AutomationsIndexHost(): ReactNode {
  const environment = useListEnvironment();
  const { width } = useSizeClass();
  const onNew = useCreate();
  return width === 'large' || width === 'xlarge' ? (
    <AutomationsOverviewPane environment={environment} links={LIST_LINKS} />
  ) : (
    <AutomationsScreen environment={environment} links={LIST_LINKS} onNew={onNew} />
  );
}

export function AutomationsLayoutHost(): ReactNode {
  const { width } = useSizeClass();
  const options = useStackOptions();
  const editing = isEditorPath(usePathname());
  const split = !editing && (width === 'large' || width === 'xlarge');
  const stack = (
    <Stack
      initialRouteName="index"
      screenLayout={screenPause}
      screenOptions={split ? { ...options, animation: 'none' } : options}
    >
      <Stack.Screen name="[automationId]/index" dangerouslySingular={idOf('automationId')} />
      <Stack.Screen name="nodes/[functionId]/index" dangerouslySingular={idOf('functionId')} />
      <Stack.Screen name="variables/[variableId]" dangerouslySingular={idOf('variableId')} />
      <Stack.Screen name="scenes/[sceneId]" dangerouslySingular={idOf('sceneId')} />
    </Stack>
  );
  return (
    <MasterDetail
      split={split}
      masterWidth="popover"
      master={<AutomationsMasterHost />}
      detail={<View className="flex-1">{stack}</View>}
    />
  );
}
