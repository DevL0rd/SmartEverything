import { Stage, TranscriptRow } from 'smarteverything-kit';
import { hits } from '../transcript-demo';

const body = (
  <div>
    <TranscriptRow
      hit={hits[0] as never}
      timeZone="UTC"
      highlighted={false}
      ready={undefined}
      open={() => undefined}
      remove={() => undefined}
    />
    <TranscriptRow
      hit={hits[3] as never}
      timeZone="UTC"
      highlighted
      ready={undefined}
      open={() => undefined}
      remove={() => undefined}
    />
    <TranscriptRow
      hit={hits[4] as never}
      timeZone="UTC"
      highlighted={false}
      ready={undefined}
      open={undefined}
      remove={undefined}
    />
  </div>
);
export const Rows = () => (
  <Stage theme="dark" width={560}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={560}>
    {body}
  </Stage>
);
