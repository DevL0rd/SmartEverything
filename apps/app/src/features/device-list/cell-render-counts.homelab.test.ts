import './homelab-mocks';
import { snapshotFixture } from '../../plugins/adguard/model/snapshot-fixture';
import { routerSnapshot } from '../../plugins/router/overview/snapshot-fixture';
import { snapshotOf } from '../../plugins/syncthing/model/snapshot-fixture';
import { budgetCase, type Budget } from './cell-budget';
import { adguardFace, routerFace, syncthingFace } from './homelab-faces';

const ROUTER_MAX: Readonly<Record<'S' | 'M', Budget>> = {
  S: { nodes: 24, hooks: 65, subscriptions: 7 },
  M: { nodes: 51, hooks: 127, subscriptions: 16 },
};

const ADGUARD_MAX: Readonly<Record<'S' | 'M', Budget>> = {
  S: { nodes: 19, hooks: 44, subscriptions: 5 },
  M: { nodes: 39, hooks: 107, subscriptions: 15 },
};

const SYNCTHING_MAX: Readonly<Record<'S' | 'M', Budget>> = {
  S: { nodes: 23, hooks: 44, subscriptions: 5 },
  M: { nodes: 48, hooks: 120, subscriptions: 16 },
};

budgetCase('router', routerFace(routerSnapshot(), true), ROUTER_MAX);
budgetCase('adguard', adguardFace(snapshotFixture(), true), ADGUARD_MAX);
budgetCase('syncthing', syncthingFace(snapshotOf(), true), SYNCTHING_MAX);
