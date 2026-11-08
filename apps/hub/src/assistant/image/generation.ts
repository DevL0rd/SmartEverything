import type { ImageOperationReceipt } from '@smarteverything/domain';
import type { ImageProviderResult } from '../../openrouter/image-provider';
import type { ImageServiceOptions } from './contract';
import type { ResolvedImage, readInputs } from './inputs';

type Images = Awaited<ReturnType<typeof readInputs>>;
export interface GenerationWork {
  readonly initial: ImageOperationReceipt;
  readonly inputs: readonly ResolvedImage[];
  readonly publish: (receipt: ImageOperationReceipt) => void;
  readonly preview: (
    receipt: ImageOperationReceipt,
    content: Buffer,
  ) => Promise<ImageOperationReceipt>;
}
export class Generation {
  receipt: ImageOperationReceipt;
  submitted = false;
  constructor(
    private readonly options: ImageServiceOptions,
    private readonly work: GenerationWork,
  ) {
    this.receipt = work.initial;
  }
  produce(images: Images, signal: AbortSignal): Promise<ImageProviderResult> {
    return this.options.provider.generate({
      request: this.receipt.request,
      endpoint: this.receipt.endpoint,
      inputs: images,
      signal,
      submitted: () => {
        this.submitted = true;
      },
      usage: (usage, source) => {
        this.receipt = this.options.repository.update({
          ...this.receipt,
          usage,
          usage_source: source,
        });
        this.work.publish(this.receipt);
      },
      preview: async (content) => {
        this.receipt = await this.work.preview(this.receipt, content);
      },
    });
  }
}
