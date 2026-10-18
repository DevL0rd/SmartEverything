import type { ReactNode } from 'react';
import { use } from 'react';
import { useActivity } from '../../activity';
import {
  HomeDataContext,
  NO_HOME_DATA,
  useHomeFavourites,
  useHomeFitness,
  useHomePower,
  useHomeReadings,
  useHomeRooms,
  useHomeScenes,
  useHomeSecurity,
  useHomeViewStore,
  type HomeData,
} from '../data/home-data';

interface ScopeProps {
  readonly children: ReactNode;
}

type Scope = (props: ScopeProps) => ReactNode;

function ownScope<K extends keyof HomeData>(field: K, useField: () => HomeData[K]): Scope {
  return function OwnHomeField({ children }: ScopeProps): ReactNode {
    const value = useField();
    const store = useHomeViewStore({ ...NO_HOME_DATA, [field]: value });
    return <HomeDataContext value={store}>{children}</HomeDataContext>;
  };
}

const SCOPES = {
  readings: ownScope('readings', useHomeReadings),
  favourites: ownScope('favourites', useHomeFavourites),
  rooms: ownScope('rooms', useHomeRooms),
  activity: ownScope('activity', useActivity),
  scenes: ownScope('scenes', useHomeScenes),
  power: ownScope('power', useHomePower),
  security: ownScope('security', useHomeSecurity),
  fitness: ownScope('fitness', useHomeFitness),
} as const;

export function HomeScope({
  field,
  children,
}: {
  readonly field: keyof typeof SCOPES;
  readonly children: ReactNode;
}): ReactNode {
  const Own = SCOPES[field];
  return use(HomeDataContext) === null ? <Own>{children}</Own> : children;
}
