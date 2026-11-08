import { applianceDriver } from '../infrared/appliance-driver';
import { IrApplianceService } from '../infrared/appliance-service';
import { blasterTransport } from '../infrared/blaster-transport';
import { IrEncoders, LEARNED_KEYS_ENCODER } from '../infrared/encoders';
import { libraryEncoders } from '../infrared/library/climate-encoder';
import { IrLibrary } from '../infrared/library/ir-library';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';

export function irAppliancesOf(options: BuildOptions): IrApplianceService {
  const library = new IrLibrary();
  return new IrApplianceService({
    store: options.store,
    transport: blasterTransport({
      store: options.store,
      clock: options.clock,
      submit: (commands) => options.core.hub.submit(commands),
    }),
    encoders: new IrEncoders([LEARNED_KEYS_ENCODER], [libraryEncoders(library)]),
    library,
    now: options.clock.now,
    log: options.log.forArea('hub.infrared'),
  });
}

export function startIrAppliances(context: ServerContext): () => void {
  return context.hub.drivers.registry.register(
    applianceDriver(context.irAppliances, context.store.feed),
  );
}
