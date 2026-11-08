import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PMREMGenerator,
  Scene,
  Vector3,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ThemeName } from '../../../design/tokens';

export type StageTheme = ThemeName;

export type ViewDirection = readonly [number, number, number];

export interface StageLight {
  readonly kelvin: number;
  readonly intensity: number;
  readonly direction: ViewDirection;
}

export interface StageFill {
  readonly sky: string;
  readonly ground: string;
  readonly intensity: number;
}

export interface StageRig {
  readonly environment: number;
  readonly key: StageLight;
  readonly fill: StageFill;
  readonly rim: StageLight;
  readonly shadowOpacity: number;
  readonly surface: string;
  readonly edge: string;
}

const KEY_DIRECTION: ViewDirection = [-1, 1.4, 1];
const RIM_DIRECTION: ViewDirection = [1.2, 0.8, -1.2];

export const STAGE_RIGS: Readonly<Record<StageTheme, StageRig>> = {
  light: {
    environment: 0.35,
    key: { kelvin: 5200, intensity: 2.4, direction: KEY_DIRECTION },
    fill: { sky: '#F3F5F8', ground: '#B9B2A8', intensity: 0.7 },
    rim: { kelvin: 9000, intensity: 1.1, direction: RIM_DIRECTION },
    shadowOpacity: 0.35,
    surface: '#F0EEE9',
    edge: '#7D7A74',
  },
  dark: {
    environment: 0.3,
    key: { kelvin: 5200, intensity: 2.2, direction: KEY_DIRECTION },
    fill: { sky: '#DCE3EE', ground: '#4A4540', intensity: 0.45 },
    rim: { kelvin: 9000, intensity: 3.4, direction: RIM_DIRECTION },
    shadowOpacity: 0.55,
    surface: '#1B1B1F',
    edge: '#6F7889',
  },
};

export const ENVIRONMENT_BLUR = 0.04;

const LIGHT_REACH = 10;

function channel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function kelvinRgb(kelvin: number): readonly [number, number, number] {
  const t = kelvin / 100;
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [channel(red), channel(green), channel(blue)];
}

export function kelvinColor(kelvin: number): Color {
  const [r, g, b] = kelvinRgb(kelvin);
  return new Color().setRGB(r / 255, g / 255, b / 255, 'srgb');
}

export function viewDirection(direction: ViewDirection, yawDeg: number): Vector3 {
  const yaw = (yawDeg * Math.PI) / 180;
  const [x, y, z] = direction;
  return new Vector3(
    x * Math.cos(yaw) + z * Math.sin(yaw),
    y,
    -x * Math.sin(yaw) + z * Math.cos(yaw),
  ).normalize();
}

export interface Stage {
  readonly lights: Group;
  readonly key: DirectionalLight;
  readonly fill: HemisphereLight;
  readonly rim: DirectionalLight;
  readonly theme: () => StageTheme;
  readonly setTheme: (theme: StageTheme) => void;
  readonly face: (yawDeg: number) => void;
  readonly dispose: () => void;
}

function directional(): DirectionalLight {
  const light = new DirectionalLight();
  light.castShadow = false;
  return light;
}

export function createStage(theme: StageTheme, yawDeg = 0): Stage {
  const key = directional();
  key.name = 'stage.key';
  const rim = directional();
  rim.name = 'stage.rim';
  const fill = new HemisphereLight();
  fill.name = 'stage.fill';
  const lights = new Group();
  lights.name = 'stage';
  lights.add(key, rim, fill);
  let current = theme;
  let yaw = yawDeg;
  const apply = (): void => {
    const rig = STAGE_RIGS[current];
    key.position.copy(viewDirection(rig.key.direction, yaw).multiplyScalar(LIGHT_REACH));
    key.color.copy(kelvinColor(rig.key.kelvin));
    key.intensity = rig.key.intensity;
    rim.position.copy(viewDirection(rig.rim.direction, yaw).multiplyScalar(LIGHT_REACH));
    rim.color.copy(kelvinColor(rig.rim.kelvin));
    rim.intensity = rig.rim.intensity;
    fill.color.set(rig.fill.sky);
    fill.groundColor.set(rig.fill.ground);
    fill.intensity = rig.fill.intensity;
  };
  apply();
  return {
    lights,
    key,
    fill,
    rim,
    theme: (): StageTheme => current,
    setTheme: (next): void => {
      current = next;
      apply();
    },
    face: (next): void => {
      yaw = next;
      apply();
    },
    dispose: (): void => {
      lights.removeFromParent();
      key.dispose();
      rim.dispose();
      fill.dispose();
    },
  };
}

export interface EnvironmentBaker {
  readonly fromScene: (scene: Scene, sigma: number) => WebGLRenderTarget;
  readonly dispose: () => void;
}

const environments = new WeakMap<object, WebGLRenderTarget>();

export function stageEnvironment(owner: object, bake: () => EnvironmentBaker): Texture {
  const known = environments.get(owner);
  if (known !== undefined) return known.texture;
  const baker = bake();
  const room = new RoomEnvironment();
  const target = baker.fromScene(room, ENVIRONMENT_BLUR);
  room.dispose();
  baker.dispose();
  environments.set(owner, target);
  return target.texture;
}

export function rendererEnvironment(renderer: WebGLRenderer): Texture {
  return stageEnvironment(renderer, () => new PMREMGenerator(renderer));
}

export function releaseStageEnvironment(owner: object): void {
  environments.get(owner)?.dispose();
  environments.delete(owner);
}

export interface StageScene {
  readonly scene: Scene;
  readonly stage: Stage;
  readonly setTheme: (theme: StageTheme) => void;
  readonly dispose: () => void;
}

export function createStageScene(theme: StageTheme, environment: Texture, yawDeg = 0): StageScene {
  const stage = createStage(theme, yawDeg);
  const scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = STAGE_RIGS[theme].environment;
  scene.background = null;
  scene.add(stage.lights);
  return {
    scene,
    stage,
    setTheme: (next): void => {
      stage.setTheme(next);
      scene.environmentIntensity = STAGE_RIGS[next].environment;
    },
    dispose: (): void => {
      stage.dispose();
      scene.environment = null;
    },
  };
}
