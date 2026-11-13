import { Agent, setGlobalDispatcher } from 'undici';

export function configureComputerHttp(): void {
  setGlobalDispatcher(new Agent({ allowH2: false }));
}
