import type { BrushLiveFrame } from '@smarteverything/domain';
import { useState } from 'react';
import { appendSample, type TraceSample } from '../model/trace-model';

export function useForceTrace(frame: BrushLiveFrame): readonly TraceSample[] {
  const [trace, setTrace] = useState<readonly TraceSample[]>([]);
  const next = appendSample(trace, frame);
  if (next !== trace) {
    setTrace(next);
  }
  return next;
}
