import { Stage, TranscriptFeed } from 'smarteverything-kit';
import { feedState } from '../transcript-demo';

const feed = (o = {}) => (
  <TranscriptFeed
    feed={feedState(o) as never}
    timeZone="UTC"
    remove={() => undefined}
    maxWidth="detail"
  />
);
export const Latest = () => (
  <Stage theme="dark" width={760} height={520}>
    {feed()}
  </Stage>
);
export const Searching = () => (
  <Stage theme="dark" width={760} height={520}>
    {feed({ words: 'lights', settled: 'lights' })}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={760} height={520}>
    {feed()}
  </Stage>
);
