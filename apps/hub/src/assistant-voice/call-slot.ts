import type { CallEndpoint } from './call-link';

export class EndpointSlot {
  private target: CallEndpoint;
  private attached = true;

  constructor(target: CallEndpoint) {
    this.target = target;
  }

  get id(): string {
    return this.target.id;
  }

  get detached(): boolean {
    return !this.attached;
  }

  readonly send: CallEndpoint['send'] = (message) => {
    if (this.attached) {
      this.target.send(message);
    }
  };

  readonly audio: CallEndpoint['audio'] = (frame) => {
    if (this.attached) {
      this.target.audio(frame);
    }
  };

  detach(): void {
    this.attached = false;
  }

  attach(target: CallEndpoint): void {
    this.target = target;
    this.attached = true;
  }
}
