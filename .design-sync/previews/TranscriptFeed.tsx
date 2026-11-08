import type { ReactNode } from 'react';
import { Stage, TranscriptFeed } from 'smarteverything-kit';
import { feedState } from '../transcript-demo';

const feed = (overrides?: Parameters<typeof feedState>[0]): ReactNode => (
  <TranscriptFeed feed={feedState(overrides)} timeZone="UTC" grouped={false} maxWidth="detail" />
);
export const Latest = (): ReactNode => (
  <Stage theme="dark" width={760} height={520}>
    {feed()}
  </Stage>
);
export const Searching = (): ReactNode => (
  <Stage theme="dark" width={760} height={520}>
    {feed({ words: 'lights', settled: 'lights' })}
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={760} height={520}>
    {feed()}
  </Stage>
);
