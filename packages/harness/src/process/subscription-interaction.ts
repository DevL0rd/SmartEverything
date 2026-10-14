import { randomUUID } from 'node:crypto';
import type { AuthEvent, AuthPrompt, ProviderAuthInteraction } from '@earendil-works/pi-ai';
import { AI_SUBSCRIPTION_INTERACTION } from '@smarteverything/domain';
import type { AiSubscriptionInteraction } from '@smarteverything/domain';
import { SubscriptionProviderError } from '../providers/errors';

export class SubscriptionEnrollmentInteraction implements ProviderAuthInteraction {
  readonly signal: AbortSignal;
  readonly id = randomUUID();
  private answerer: ((answer: string) => void) | undefined;
  private current: AiSubscriptionInteraction;
  private readonly first: Promise<void>;
  private awaken: (() => void) | undefined;
  constructor(
    readonly abort: AbortController,
    private readonly publish: (interaction: AiSubscriptionInteraction) => void,
  ) {
    this.signal = AbortSignal.any([abort.signal, AbortSignal.timeout(10 * 60 * 1000)]);
    this.current = {
      enrollment_id: this.id,
      url: null,
      message: 'Starting subscription authorization on the supplying host.',
      prompt: null,
      options: [],
      user_code: null,
    };
    this.first = new Promise((resolve) => {
      this.awaken = resolve;
    });
  }
  wait(): Promise<void> {
    return this.first;
  }
  settled(): void {
    this.awaken?.();
  }
  notify(event: AuthEvent): void {
    if (event.type === 'auth_url')
      this.current = {
        ...this.current,
        url: AI_SUBSCRIPTION_INTERACTION.shape.url.parse(event.url),
        message:
          event.instructions ??
          'Open this authorization URL in a browser on the supplying computer.',
      };
    else if (event.type === 'device_code')
      this.current = {
        ...this.current,
        url: AI_SUBSCRIPTION_INTERACTION.shape.url.parse(event.verificationUri),
        user_code: event.userCode,
        prompt: 'device_code',
        message: 'Authorize this code yourself in the provider’s sign-in page.',
      };
    else this.current = { ...this.current, message: event.message };
    this.publish(this.current);
    this.awaken?.();
  }
  prompt(prompt: AuthPrompt): Promise<string> {
    if (prompt.type === 'secret')
      return Promise.reject(
        new SubscriptionProviderError(
          'AUTH_DENIED',
          'Subscription sign-in cannot request an API key or password.',
        ),
      );
    this.current = {
      ...this.current,
      message: prompt.message,
      prompt: prompt.type,
      options:
        prompt.type === 'select'
          ? prompt.options.map((option) => ({ id: option.id, label: option.label }))
          : [],
    };
    this.publish(this.current);
    this.awaken?.();
    const signal =
      prompt.signal === undefined ? this.signal : AbortSignal.any([this.signal, prompt.signal]);
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        this.answerer = undefined;
        reject(new SubscriptionProviderError('AUTH_DENIED', 'Subscription sign-in was cancelled.'));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
      this.answerer = (answer): void => {
        signal.removeEventListener('abort', abort);
        this.answerer = undefined;
        resolve(answer);
      };
    });
  }
  answer(answer: string): void {
    if (this.answerer === undefined)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'This sign-in has no pending manual input.',
      );
    this.answerer(answer);
  }
}
