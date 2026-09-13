import { aircraftJourney } from './aircraftJourney';
import type { AircraftView, ContextMesh, ContextPart, Vec3 } from './aircraftGeometry';

export interface AircraftCamera {
  view: AircraftView;
  journeyTime?: number;
  yaw: number;
  pitch: number;
  zoom: number;
  opening: number;
  rotation: number;
  selected: ContextPart | null;
}
export interface ProjectedPoint {
  x: number;
  y: number;
}
export interface AircraftRenderer {
  draw: (camera: AircraftCamera) => void;
  dispose: () => void;
}

const centers: Record<AircraftView, Vec3> = {
  aircraft: [-1.1, 0, 0.5],
  propeller: [2.35, 0, 0.5],
  blade: [2.35, 0, 1.25],
  section: [0, -0.5, 0.225],
};

/** Small local WebGL renderer using the same triangle/normal approach as the Atlas renderer. */
export function createAircraftRenderer(
  canvas: HTMLCanvasElement,
  geometry: Record<AircraftView, ContextMesh[]>,
  onProject: (point: ProjectedPoint | null, landmarks: Record<string, ProjectedPoint>) => void,
): AircraftRenderer {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true });
  if (!gl) throw new Error('WebGL unavailable');
  const vertexSource = `
    attribute vec3 a_position, a_normal, a_color;
    uniform vec3 u_center, u_right, u_up, u_forward;
    uniform vec2 u_scale;
    uniform float u_shift, u_rotation, u_distance;
    varying vec3 v_color;
    vec3 rotate(vec3 p){float c=cos(u_rotation),s=sin(u_rotation);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
    void main(){
      vec3 p=a_position; p.x+=u_shift;
      if(abs(u_rotation)>.00001){p.z-=.5;p=rotate(p);p.z+=.5;}
      p-=u_center;
      if(u_distance>0.) {
        float depth=u_distance-dot(p,u_forward);
        gl_Position=vec4(dot(p,u_right)*u_scale.x,dot(p,u_up)*u_scale.y,1.00008*depth-.0200008,depth);
      } else gl_Position=vec4(dot(p,u_right)*u_scale.x,dot(p,u_up)*u_scale.y,-dot(p,u_forward)*.025,1.);
      vec3 n=normalize(rotate(a_normal));
      float light=.56+.40*abs(dot(n,normalize(vec3(.55,-.35,.8))));
      v_color=a_color*light;
    }`;
  const fragmentSource = `precision mediump float;varying vec3 v_color;uniform float u_alpha;void main(){gl_FragColor=vec4(v_color,u_alpha);}`;
  const shader = (type: number, source: string) => {
    const result = gl.createShader(type);
    if (!result) throw new Error('Shader allocation failed');
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      gl.deleteShader(result);
      throw new Error('Shader compilation failed');
    }
    return result;
  };
  const vertex = shader(gl.VERTEX_SHADER, vertexSource);
  const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Program allocation failed');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program linking failed');
  const locations = Object.fromEntries(
    [
      'u_center',
      'u_right',
      'u_up',
      'u_forward',
      'u_scale',
      'u_shift',
      'u_rotation',
      'u_alpha',
      'u_distance',
    ].map((key) => [key, gl.getUniformLocation(program, key)]),
  );
  const attributes = ['a_position', 'a_normal', 'a_color'].map((key) =>
    gl.getAttribLocation(program, key),
  );
  const cache = new Map<ContextMesh, { buffer: WebGLBuffer; count: number }>();
  for (const meshes of Object.values(geometry))
    for (const mesh of meshes) {
      if (cache.has(mesh)) continue;
      const values: number[] = [];
      const color = mesh.color
        .slice(1)
        .match(/../g)!
        .map((v) => parseInt(v, 16) / 255);
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const tri = mesh.indices.slice(i, i + 3).map((n) => mesh.vertices.slice(n * 3, n * 3 + 3));
        const u = tri[1].map((v, k) => v - tri[0][k]);
        const v = tri[2].map((x, k) => x - tri[0][k]);
        const normal = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        const length = Math.hypot(...normal) || 1;
        for (const point of tri) values.push(...point, ...normal.map((n) => n / length), ...color);
      }
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('Buffer allocation failed');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
      cache.set(mesh, { buffer, count: values.length / 9 });
    }
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0, 0, 0, 0);
  let latest: AircraftCamera | null = null;
  let disposed = false;
  function draw(camera: AircraftCamera) {
    if (disposed) return;
    latest = camera;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, w, h);
    gl!.useProgram(program);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    const yaw = (camera.yaw * Math.PI) / 180;
    const pitch = (camera.pitch * Math.PI) / 180;
    let forward: Vec3 = [
      Math.cos(pitch) * Math.cos(yaw),
      Math.cos(pitch) * Math.sin(yaw),
      Math.sin(pitch),
    ];
    let right: Vec3 = [-Math.sin(yaw), Math.cos(yaw), 0];
    let up: Vec3 = [
      -Math.sin(pitch) * Math.cos(yaw),
      -Math.sin(pitch) * Math.sin(yaw),
      Math.cos(pitch),
    ];
    if (camera.view === 'blade') [right, up] = [up, right.map((v) => -v) as Vec3];
    let center = [...centers[camera.view]] as Vec3;
    if (camera.view === 'section') center[0] -= camera.opening * 0.1;
    if (camera.view === 'blade') center[0] -= camera.opening * 0.11;
    const base =
      camera.view === 'aircraft'
        ? 30
        : camera.view === 'propeller'
          ? 3.25
          : camera.view === 'blade'
            ? 1.52
            : 1.18;
    let scale =
      Math.min(
        width / base,
        height /
          (camera.view === 'aircraft'
            ? 11.8
            : camera.view === 'propeller'
              ? 3.25
              : camera.view === 'blade'
                ? 0.79
                : 0.88),
      ) *
      0.87 *
      camera.zoom;
    const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    if (camera.view === 'aircraft') {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const mesh of geometry.aircraft)
        for (let i = 0; i < mesh.vertices.length; i += 9) {
          const p = mesh.vertices.slice(i, i + 3).map((v, k) => v - center[k]);
          const x = dot(p, right),
            y = dot(p, up);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      const middleX = (minX + maxX) / 2,
        middleY = (minY + maxY) / 2;
      center.forEach((_, k) => {
        center[k] += right[k] * middleX + up[k] * middleY;
      });
      scale =
        Math.min(width / (maxX - minX), height / Math.max(5, maxY - minY)) * 0.8 * camera.zoom;
    }
    const journey =
      camera.journeyTime === undefined ? null : aircraftJourney(camera.journeyTime, width / height);
    if (journey) {
      center = journey.target;
      forward = journey.forward;
      right = journey.right;
      up = journey.up;
      scale = height / (2 * Math.tan((17 * Math.PI) / 180));
    }
    const project = (point: Vec3) => {
      const p = point.map((v, k) => v - center[k]);
      const depth = journey ? Math.max(0.01, journey.distance - dot(p, forward)) : 1;
      return {
        x: 50 + (dot(p, right) * scale * 100) / (width * depth),
        y: 50 - (dot(p, up) * scale * 100) / (height * depth),
      };
    };
    const landmarks: Record<string, ProjectedPoint> =
      camera.view === 'aircraft'
        ? {
            wing: project([-0.4, 7.2, 0.65]),
            tail: project([-6.7, 0, 1.4]),
            cabin: project([0.6, 0, -0.5]),
            propeller: project([2.35, 0, 0.5]),
            front: project([3.8, 0, 0.5]),
          }
        : camera.view === 'blade'
          ? {
              root: project([2.35, 0, 0.615]),
              tip: project([2.35, 0, 1.89]),
            }
          : {};
    gl!.uniform1f(locations.u_distance, journey?.distance ?? 0);
    gl!.uniform3fv(locations.u_center, center);
    gl!.uniform3fv(locations.u_right, right);
    gl!.uniform3fv(locations.u_up, up);
    gl!.uniform3fv(locations.u_forward, forward);
    gl!.uniform2f(locations.u_scale, (2 * scale) / width, (2 * scale) / height);
    const matches = (mesh: ContextMesh) =>
      !camera.selected ||
      (camera.selected === 'propeller'
        ? mesh.family === 'propeller'
        : mesh.group === camera.selected);
    const meshes = journey ? geometry.aircraft : geometry[camera.view];
    const isClose = camera.view === 'blade' || camera.view === 'section';
    function render(mesh: ContextMesh, alpha: number) {
      const packed = cache.get(mesh)!;
      gl!.bindBuffer(gl!.ARRAY_BUFFER, packed.buffer);
      attributes.forEach((location, i) => {
        gl!.enableVertexAttribArray(location);
        gl!.vertexAttribPointer(location, 3, gl!.FLOAT, false, 36, i * 12);
      });
      gl!.uniform1f(
        locations.u_shift,
        journey
          ? mesh.assembly === 'under' && !mesh.opposite
            ? -journey.opening * 0.3
            : 0
          : isClose && mesh.assembly === 'under'
            ? -camera.opening * (camera.view === 'section' ? 0.27 : 0.3)
            : 0,
      );
      gl!.uniform1f(
        locations.u_rotation,
        mesh.family === 'propeller' ? (journey?.rotation ?? (!isClose ? camera.rotation : 0)) : 0,
      );
      gl!.uniform1f(locations.u_alpha, alpha);
      gl!.drawArrays(gl!.TRIANGLES, 0, packed.count);
    }
    const opacity = (mesh: ContextMesh) =>
      journey
        ? mesh.family === 'airframe'
          ? journey.airframeAlpha
          : mesh.opposite
            ? journey.otherBladeAlpha
            : 1
        : matches(mesh)
          ? 1
          : camera.view === 'aircraft'
            ? 0.82
            : 0.32;
    gl!.depthMask(true);
    gl!.disable(gl!.BLEND);
    for (const mesh of meshes) if (opacity(mesh) >= 0.999) render(mesh, 1);
    gl!.enable(gl!.BLEND);
    gl!.blendFuncSeparate(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA, gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);
    gl!.depthMask(false);
    for (const mesh of meshes) {
      const alpha = opacity(mesh);
      if (alpha > 0.001 && alpha < 0.999) render(mesh, alpha);
    }
    gl!.depthMask(true);
    if (journey) {
      onProject(
        null,
        camera.view === 'aircraft'
          ? landmarks
          : journey.opening > 0.6
            ? {
                under: project([2.35 - 0.3 * journey.opening, 0, 1.5]),
                upper: project([2.36, -0.04, 1.6]),
                web: project([2.35, 0, 1.25]),
                spar: project([2.35, 0, 0.76]),
              }
            : {},
      );
      return;
    }
    const selected = meshes.filter(matches);
    if (camera.selected && selected.length) {
      const points = selected.flatMap((mesh) => {
        const point: Vec3 = [0, 0, 0];
        for (let i = 0; i < mesh.vertices.length; i++)
          point[i % 3] += mesh.vertices[i] / (mesh.vertices.length / 3);
        if (isClose && mesh.assembly === 'under')
          point[0] -= camera.opening * (camera.view === 'section' ? 0.27 : 0.3);
        return [point];
      });
      const anchor = points
        .reduce((sum, point) => sum.map((v, i) => v + point[i] / points.length) as Vec3, [
          0, 0, 0,
        ] as Vec3)
        .map((v, i) => v - center[i]);
      onProject(
        {
          x: 50 + (dot(anchor, right) * scale * 100) / width,
          y: 50 - (dot(anchor, up) * scale * 100) / height,
        },
        landmarks,
      );
    } else onProject(null, landmarks);
  }
  const observer = new ResizeObserver(() => {
    if (latest) draw(latest);
  });
  observer.observe(canvas);
  const snapshot = () => {
    if (latest) draw(latest);
  };
  canvas.addEventListener('book-snapshot', snapshot);
  return {
    draw,
    dispose() {
      disposed = true;
      canvas.removeEventListener('book-snapshot', snapshot);
      observer.disconnect();
      for (const item of cache.values()) gl.deleteBuffer(item.buffer);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteProgram(program);
    },
  };
}
