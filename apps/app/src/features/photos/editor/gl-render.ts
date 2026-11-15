import type { PhotoBox } from '@smarteverything/domain';
import type { CanvasView } from './canvas-view';

const VERTEX = `
attribute vec2 corner;
uniform mat3 toSource;
varying vec2 uv;
void main() {
  vec2 shown = vec2((corner.x + 1.0) * 0.5, 1.0 - (corner.y + 1.0) * 0.5);
  uv = (toSource * vec3(shown, 1.0)).xy;
  gl_Position = vec4(corner, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D photo;
uniform sampler2D curve;
uniform vec4 red;
uniform vec4 green;
uniform vec4 blue;
float level(float value, int channel) {
  vec3 mapped = texture2D(curve, vec2((value * 255.0 + 0.5) / 256.0, 0.5)).rgb;
  return channel == 0 ? mapped.r : channel == 1 ? mapped.g : mapped.b;
}
void main() {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 source = texture2D(photo, uv).rgb;
  vec3 toned = vec3(level(source.r, 0), level(source.g, 1), level(source.b, 2));
  vec3 mixed = vec3(
    dot(red.xyz, toned) + red.w,
    dot(green.xyz, toned) + green.w,
    dot(blue.xyz, toned) + blue.w
  );
  gl_FragColor = vec4(clamp(mixed, 0.0, 1.0), 1.0);
}
`;

export interface GlScene {
  readonly gl: WebGLRenderingContext;
  readonly program: WebGLProgram;
  readonly photo: WebGLTexture;
  readonly patched: WebGLTexture;
  readonly curve: WebGLTexture;
}

const WITH_PATCHES = new WeakSet<GlScene>();

export interface PatchLayer {
  readonly box: PhotoBox;
  readonly image: HTMLImageElement;
}

function compiled(gl: WebGLRenderingContext, kind: number, text: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (shader === null) throw new Error('WebGL gave no shader');
  gl.shaderSource(shader, text);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'the shader did not compile');
  }
  return shader;
}

function linked(gl: WebGLRenderingContext): WebGLProgram {
  const program = gl.createProgram();
  gl.attachShader(program, compiled(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compiled(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'the program did not link');
  }
  return program;
}

function texture(gl: WebGLRenderingContext): WebGLTexture {
  const made = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, made);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return made;
}

function quad(gl: WebGLRenderingContext, program: WebGLProgram): void {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
}

export function createScene(canvas: HTMLCanvasElement): GlScene {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (gl === null) throw new Error('This device gives no WebGL');
  const program = linked(gl);
  gl.useProgram(program);
  quad(gl, program);
  const scene = {
    gl,
    program,
    photo: texture(gl),
    patched: texture(gl),
    curve: texture(gl),
  };
  gl.uniform1i(gl.getUniformLocation(program, 'photo'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'curve'), 1);
  return scene;
}

export function uploadPhoto(scene: GlScene, image: HTMLImageElement): void {
  const { gl } = scene;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, scene.photo);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
}

export function uploadPatched(
  scene: GlScene,
  base: HTMLImageElement,
  layers: readonly PatchLayer[],
): void {
  if (layers.length === 0) {
    WITH_PATCHES.delete(scene);
    return;
  }
  const surface = document.createElement('canvas');
  surface.width = base.naturalWidth;
  surface.height = base.naturalHeight;
  const context = surface.getContext('2d');
  if (context === null) throw new Error('This device gives no 2D canvas');
  context.drawImage(base, 0, 0);
  for (const { box, image } of layers) {
    context.drawImage(
      image,
      box.x * surface.width,
      box.y * surface.height,
      box.w * surface.width,
      box.h * surface.height,
    );
  }
  const { gl } = scene;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, scene.patched);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, surface);
  WITH_PATCHES.add(scene);
}

function columnMajor(m: CanvasView['transform']): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

function drawView(scene: GlScene, view: CanvasView): void {
  const { gl, program } = scene;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(
    gl.TEXTURE_2D,
    view.patched && WITH_PATCHES.has(scene) ? scene.patched : scene.photo,
  );
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, scene.curve);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGB,
    256,
    1,
    0,
    gl.RGB,
    gl.UNSIGNED_BYTE,
    Uint8Array.from(view.curves),
  );
  gl.uniformMatrix3fv(
    gl.getUniformLocation(program, 'toSource'),
    false,
    columnMajor(view.transform),
  );
  const [a, b, c, d, e, f, g, h, i, j, k, l] = view.matrix;
  gl.uniform4f(gl.getUniformLocation(program, 'red'), a, b, c, d);
  gl.uniform4f(gl.getUniformLocation(program, 'green'), e, f, g, h);
  gl.uniform4f(gl.getUniformLocation(program, 'blue'), i, j, k, l);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export interface TileLayout {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly gap: number;
  readonly rowGap: number;
}

export interface TileRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function tileRect(index: number, count: number, layout: TileLayout): TileRect {
  const columns = Math.max(1, Math.min(layout.columns, count));
  const rows = Math.ceil(count / columns);
  const width = (layout.width - layout.gap * (columns - 1)) / columns;
  const height = (layout.height - layout.rowGap * (rows - 1)) / rows;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: Math.round(column * (width + layout.gap)),
    y: Math.round(layout.height - row * (height + layout.rowGap) - height),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function drawScene(scene: GlScene, views: readonly CanvasView[], layout: TileLayout): void {
  const { gl } = scene;
  gl.viewport(0, 0, layout.width, layout.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  views.forEach((view, index) => {
    const rect = tileRect(index, views.length, layout);
    gl.viewport(rect.x, rect.y, rect.width, rect.height);
    drawView(scene, view);
  });
}

export function releaseScene(scene: GlScene): void {
  const { gl } = scene;
  gl.deleteTexture(scene.photo);
  gl.deleteTexture(scene.patched);
  gl.deleteTexture(scene.curve);
  gl.deleteProgram(scene.program);
}
