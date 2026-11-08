import type { ReactNode } from 'react';
import { Stage, TranscriptRow } from 'smarteverything-kit';
import { hits } from '../transcript-demo';

const body = (
  <div>
    <TranscriptRow
      hit={hits[0]}
      timeZone="UTC"
      showSource={false}
      highlighted={false}
      ready={undefined}
      open={() => undefined}
      remove={() => undefined}
    />
    <TranscriptRow
      hit={hits[3]}
      timeZone="UTC"
      showSource={false}
      highlighted
      ready={undefined}
      open={() => undefined}
      remove={() => undefined}
    />
    <TranscriptRow
      hit={hits[4]}
      timeZone="UTC"
      showSource={false}
      highlighted={false}
      ready={undefined}
      open={undefined}
      remove={undefined}
    />
  </div>
);
export const Rows = (): ReactNode => (
  <Stage theme="dark" width={560}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={560}>
    {body}
  </Stage>
);
