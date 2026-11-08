import { it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { ENERGY_MODELS } from '../../../src/devices/energy';
it('t', () => { for (const s of ENERGY_MODELS) console.log(s.id, JSON.stringify(checkAuthoring(s).triangles), JSON.stringify(checkAuthoring(s).problems.map(p=>p.message))); });
