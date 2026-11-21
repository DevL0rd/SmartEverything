import './homelab-mocks';
import { snapshotFixture } from '../../plugins/adguard/model/snapshot-fixture';
import { routerSnapshot } from '../../plugins/router/overview/snapshot-fixture';
import { snapshotOf } from '../../plugins/syncthing/model/snapshot-fixture';
import { budgetCase, type Budget } from './cell-budget';
import { adguardFace, routerFace, syncthingFace } from './homelab-faces';

const ROUTER_MAX: Readonly<Record<'S' | 'M', Budget>> = {
  S: { nodes: 24, hooks: 81, subscriptions: 9 },
  M: { nodes: 51, hooks: 148, subscriptions: 18 },
};

const ADGUARD_MAX: Readonly<Record<'S' | 'M', Budget>> = {
  S: { nodes: 19, hooks: 48, subscriptions: 5 },
  M: { nodes: 40, hooks: 112, subscriptions: 15 },
};

const SYNCTHING_MAX: Readonly<Record<'S' | 'M', Budget>> = {
  S: { nodes: 23, hooks: 48, subscriptions: 5 },
  M: { nodes: 49, hooks: 134, subscriptions: 17 },
};

budgetCase('router', routerFace(routerSnapshot(), true), ROUTER_MAX);
budgetCase('adguard', adguardFace(snapshotFixture(), true), ADGUARD_MAX);
budgetCase('syncthing', syncthingFace(snapshotOf(), true), SYNCTHING_MAX);
