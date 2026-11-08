import type { ModelSpec } from '@smarteverything/domain';
import { GATEWAY_PUCK_MODEL } from './gateway-puck';
import { INKJET_PRINTER_MODEL } from './inkjet';
import { IR_PUCK_MODEL } from './ir-puck';
import { LAPTOP_MODEL } from './laptop';
import { ROUTER_MODEL } from './router';

export { GATEWAY_PUCK_MODEL, INKJET_PRINTER_MODEL, IR_PUCK_MODEL, LAPTOP_MODEL, ROUTER_MODEL };

export const NETWORK_DEFAULT_MODELS: readonly ModelSpec[] = [
  IR_PUCK_MODEL,
  GATEWAY_PUCK_MODEL,
  ROUTER_MODEL,
  LAPTOP_MODEL,
  INKJET_PRINTER_MODEL,
];
