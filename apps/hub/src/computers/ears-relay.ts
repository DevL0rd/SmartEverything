import type {
  ComputerFeature,
  ListeningNodeMessage,
  RemoteEarNodeMessage,
} from '@smarteverything/domain';
import type { EarHostSend, SessionEarHosts } from '../listening/ear-hosts';
import type { ComputerAudio, ComputerSpeaker, EarSend } from './computer-call-audio';
import type { SessionEars } from './computer-ears';

export class EarsRelay implements SessionEars, SessionEarHosts {
  private target: (SessionEars & { readonly audio: ComputerAudio }) | null = null;
  private hosts: SessionEarHosts | null = null;

  readonly audio: ComputerAudio = {
    microphone: (computerId, handlers) =>
      this.target?.audio.microphone(computerId, handlers) ?? null,
    speaker: (computerId): ComputerSpeaker | null => this.target?.audio.speaker(computerId) ?? null,
  };

  bind(target: SessionEars & { readonly audio: ComputerAudio }): void {
    this.target = target;
  }

  bindHosts(hosts: SessionEarHosts): void {
    this.hosts = hosts;
  }

  join(computerId: string, features: readonly ComputerFeature[], send: EarHostSend): void {
    this.hosts?.join(computerId, features, send);
  }

  leave(computerId: string): void {
    this.hosts?.leave(computerId);
  }

  relayed(computerId: string, key: string, message: RemoteEarNodeMessage): void {
    this.hosts?.relayed(computerId, key, message);
  }

  scored(computerId: string, id: string, heard: boolean): void {
    this.hosts?.scored(computerId, id, heard);
  }

  scoreFailed(computerId: string, id: string, reason: string): void {
    this.hosts?.scoreFailed(computerId, id, reason);
  }

  online(computerId: string, send: EarSend): void {
    this.target?.online(computerId, send);
  }

  offline(computerId: string): void {
    this.target?.offline(computerId);
  }

  heard(computerId: string, message: ListeningNodeMessage): void {
    this.target?.heard(computerId, message);
  }
}
