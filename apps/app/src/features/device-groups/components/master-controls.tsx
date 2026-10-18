import type { ReactNode } from 'react';
import { useFocusRequest } from '../../../components/focus-request';
import { Text } from '../../../components/text';
import { colourNote, memberNoun } from '../group-summary';
import { masterControlOf } from '../model/master-focus';
import { LevelBand, WhiteBand } from '../widget/master-band';
import { Notice } from '../widget/notice';
import type { GroupData } from '../widget/use-group-data';
import { GroupColourStrip, supportsColourStrip } from './group-colour-strip';

export function MasterControls({
  data,
  focus,
  onMore,
}: {
  readonly data: GroupData;
  readonly focus: string | null;
  readonly onMore: () => void;
}): ReactNode {
  const requested = masterControlOf(focus);
  const levelRef = useFocusRequest(requested === 'level');
  const whiteRef = useFocusRequest(requested === 'white');
  const colourRef = useFocusRequest(requested === 'colour');
  const { state, colours } = data.view;
  const noun = memberNoun(data.lights);
  const band = { state, colours, master: data.master, name: data.name, lights: true, noun };
  const note = colourNote(state, noun);
  return (
    <>
      {state.power === 'none' ? <Notice text={`None of these ${noun}s can be reached`} /> : null}
      {(state.support.brightness ?? 0) > 0 ? <LevelBand {...band} focusRef={levelRef} /> : null}
      {(state.support.color_temperature ?? 0) > 0 ? (
        <WhiteBand {...band} focusRef={whiteRef} />
      ) : null}
      {supportsColourStrip(state) ? (
        <GroupColourStrip
          state={state}
          colours={colours}
          master={data.master}
          name={data.name}
          focusRef={colourRef}
          onMore={onMore}
        />
      ) : null}
      {note === null ? null : (
        <Text variant="footnote" tone="variant">
          {note}
        </Text>
      )}
    </>
  );
}
