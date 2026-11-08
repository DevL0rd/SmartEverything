import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useProfiles } from '../../../store/people';
import { PeopleEmpty, PeopleFace, peopleHref } from './people-faces';
import { widgetPeople } from './people-model';
import { RouterWidgetFrame, type RouterReady } from './router-widget-frame';

export function PeopleWidget(): ReactNode {
  const profiles = useProfiles();
  const { cls } = useWidgetFace();
  const band = (ready: RouterReady): ReactNode =>
    cls === 's' || widgetPeople(ready.snapshot.people, profiles).length > 0 ? undefined : (
      <Button label="Open devices" variant="tonal" href={peopleHref(ready)} />
    );
  return (
    <RouterWidgetFrame title="Who’s home" icon="users" accent="viz-1" actions={band}>
      {(ready, layout) => {
        const people = widgetPeople(ready.snapshot.people, profiles);
        return people.length === 0 ? (
          <PeopleEmpty layout={layout} />
        ) : (
          <PeopleFace people={people} ready={ready} layout={layout} />
        );
      }}
    </RouterWidgetFrame>
  );
}
