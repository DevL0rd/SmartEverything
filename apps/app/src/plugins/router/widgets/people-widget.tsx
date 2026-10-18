import type { ReactNode } from 'react';
import { useProfiles } from '../../../store/people';
import { PeopleEmpty, PeopleFace } from './people-faces';
import { widgetPeople } from './people-model';
import { RouterWidgetFrame } from './router-widget-frame';

export function PeopleWidget(): ReactNode {
  const profiles = useProfiles();
  return (
    <RouterWidgetFrame title="Who’s home" icon="users" accent="viz-1">
      {(ready) => {
        const people = widgetPeople(ready.snapshot.clients, profiles);
        return people.length === 0 ? (
          <PeopleEmpty ready={ready} />
        ) : (
          <PeopleFace people={people} ready={ready} />
        );
      }}
    </RouterWidgetFrame>
  );
}
