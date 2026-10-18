import { SAMPLE_TOPICS, type SampleParts } from '@smarteverything/domain';
import type { SampleTopic } from './tick';

export class FrameBuilder {
  private readonly signatures = new Map<SampleTopic, string>();

  changed(candidates: SampleParts, key: boolean): SampleParts {
    const parts: SampleParts = {};
    for (const topic of SAMPLE_TOPICS) {
      const part = candidates[topic];
      if (part === undefined) {
        continue;
      }
      const signature = JSON.stringify(part);
      if (key || this.signatures.get(topic) !== signature) {
        this.signatures.set(topic, signature);
        Object.assign(parts, { [topic]: part });
      }
    }
    return parts;
  }

  forget(topic: SampleTopic): void {
    this.signatures.delete(topic);
  }
}
