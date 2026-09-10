export function initBlade(root, data, initialLocal = false) {
  const canvas = root.querySelector('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true });
  if (!gl) {
    root.querySelector('[data-detail]').textContent = 'この環境では立体表示を利用できません。';
    return;
  }
  const groups = [
    ['upper', 'アッパー'],
    ['under', 'アンダー'],
    ['spar', 'ペラスパー'],
    ['ribs', '桁リブ'],
    ['web-core', 'ウェブ材'],
    ['roving', 'ロービング'],
    ['belt', '黒帯'],
    ['glass', 'マイクロガラス'],
    ['foam', '発泡ウレタン'],
    ['putty', '後縁パテ'],
  ];
  let mode = 'body',
    rootZoom = false,
    learning = false,
    yaw = (-12 * Math.PI) / 180,
    pitch = (60 * Math.PI) / 180,
    explode = 0.65,
    selected = null,
    token = 0;
  const controls = Object.fromEntries(
    [...root.querySelectorAll('[data-control]')].map((e) => [e.dataset.control, e]),
  );
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const kind = (p) =>
    p.group === 'roving' || p.group === 'spar'
      ? 3
      : p.group === 'belt'
        ? 4
        : p.id.includes('core')
          ? 2
          : p.group === 'glass'
            ? 5
            : p.group === 'foam'
              ? 6
              : p.group === 'ribs'
                ? 8
                : p.group === 'putty'
                  ? 7
                  : 1;
  const anchorSets = { body: {}, local: {} },
    rootAnchors = {};
  function unpack(model, whole) {
    let values = [];
    for (const p of model.parts) {
      let vb = bytes(p.positions),
        ib = bytes(p.indices),
        vs = new DataView(vb.buffer),
        is = new DataView(ib.buffer),
        points = [];
      for (let i = 0; i < vb.length / 6; i++) {
        let q = [0, 1, 2].map((k) => p.min[k] + vs.getUint16(i * 6 + k * 2, true) * p.scale[k]);
        points.push(
          whole
            ? [(q[2] - 735) / 1100, -q[0] / 1100, q[1] / 1100]
            : [q[0] - 0.5, q[1] - 0.027, q[2]],
        );
      }
      const anchors = anchorSets[whole ? 'body' : 'local'];
      if (!anchors[p.group]) {
        let pts = points,
          avg = pts.reduce((s, p) => s.map((v, k) => v + p[k] / pts.length), [0, 0, 0]);
        anchors[p.group] = { point: avg, lift: p.assembly === 'under' ? -2 : 0 };
        if (whole) {
          let near = points.filter((p) => p[0] < (370 - 735) / 1100);
          if (near.length)
            rootAnchors[p.group] = {
              point: near.reduce((s, p) => s.map((v, k) => v + p[k] / near.length), [0, 0, 0]),
              lift: anchors[p.group].lift,
            };
        }
      }
      let gid = groups.findIndex((g) => g[0] === p.group),
        color = p.color
          .slice(1)
          .match(/../g)
          .map((v) => parseInt(v, 16) / 255);
      for (let i = 0; i < ib.length; i += 6) {
        let t = [0, 1, 2].map((k) => points[is.getUint16(i + k * 2, true)]),
          u = t[1].map((v, k) => v - t[0][k]),
          v = t[2].map((q, k) => q - t[0][k]),
          n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
          len = Math.hypot(...n) || 1;
        for (const q of t)
          values.push(
            ...q,
            ...n.map((v) => v / len),
            ...color,
            p.assembly === 'under' ? -2 : 0,
            gid,
            kind(p),
          );
      }
    }
    return new Float32Array(values);
  }
  const values = { body: unpack(data.body, true), local: unpack(data.local, false) };
  const vertex = `attribute vec3 a_position,a_normal,a_color;attribute float a_lift,a_group,a_kind;uniform vec2 u_angles,u_scale;uniform vec3 u_center;uniform float u_explode,u_selected,u_pass,u_flip;varying vec3 v_color,v_pos;varying float v_kind,v_alpha;vec3 turn(vec3 p){if(u_flip>.5){p.y=-p.y;p.z=-p.z;}float c=cos(u_angles.x),s=sin(u_angles.x);vec3 q=vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);float cc=cos(u_angles.y),ss=sin(u_angles.y);return vec3(q.x,q.y*cc-q.z*ss,q.y*ss+q.z*cc);}void main(){bool hit=abs(a_group-u_selected)<.1;vec3 p=a_position-u_center;p.y+=a_lift*.13*u_explode;p=turn(p);gl_Position=vec4(p.x*u_scale.x,p.y*u_scale.y,-p.z*.45,1.);if((u_pass>1.5&&hit)||(u_pass>.5&&u_pass<1.5&&!hit))gl_Position=vec4(3.,3.,3.,1.);vec3 n=normalize(turn(a_normal));float lit=.68+.30*abs(dot(n,vec3(-.3,.55,.78)));v_color=a_color*lit;v_pos=a_position;v_kind=a_kind;v_alpha=u_pass>1.5?.12:1.;}`;
  const fragment = `precision mediump float;varying vec3 v_color,v_pos;varying float v_kind,v_alpha;void main(){float t=1.;if(v_kind<1.5){t=.86+.12*mod(floor((v_pos.x+v_pos.z)*90.)+floor((v_pos.x-v_pos.z)*90.),2.);}else if(v_kind<2.5){t=.88+.1*sin(v_pos.z*1800.+sin(v_pos.x*40.));}else if(v_kind<3.5){t=.84+.14*sin(v_pos.z*2500.);}else if(v_kind<4.5){t=.85+.13*mod(floor(v_pos.x*110.)+floor(v_pos.z*110.),2.);}else if(v_kind<5.5){t=.91+.07*sin((v_pos.x+v_pos.z)*700.);}else if(v_kind<6.5){t=.87+.11*fract(sin(dot(v_pos.xy,vec2(127.1,311.7)))*4375.);}else if(v_kind>7.5){t=.88+.09*sin(v_pos.x*3400.);}gl_FragColor=vec4(v_color*t,v_alpha);}`;
  function shader(type, src) {
    let s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [name, size, offset] of [
    ['a_position', 3, 0],
    ['a_normal', 3, 12],
    ['a_color', 3, 24],
    ['a_lift', 1, 36],
    ['a_group', 1, 40],
    ['a_kind', 1, 44],
  ]) {
    let n = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(n);
    gl.vertexAttribPointer(n, size, gl.FLOAT, false, 48, offset);
  }
  const uniform = Object.fromEntries(
    ['u_angles', 'u_scale', 'u_center', 'u_explode', 'u_selected', 'u_pass', 'u_flip'].map((n) => [
      n,
      gl.getUniformLocation(program, n),
    ]),
  );
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  let count = 0;
  function upload() {
    let v = values[mode === 'body' ? 'body' : 'local'];
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    count = v.length / 12;
  }
  function draw() {
    let w = canvas.clientWidth,
      h = canvas.clientHeight,
      dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    let isBody = mode === 'body',
      close = isBody && rootZoom,
      scale =
        Math.min(
          w / (close ? 0.4 : isBody ? 1.52 : mode === 'section' ? 1.12 : 1.62),
          h / (close ? 0.3 : isBody ? 0.47 : mode === 'section' ? 0.68 : 0.77),
        ) * 0.92;
    const center = [close ? (210 - 735) / 1100 : 0, -0.13 * 0.65, close ? 0.01 : 0];
    gl.uniform2f(uniform.u_angles, yaw, pitch);
    gl.uniform2f(uniform.u_scale, (2 * scale) / w, (2 * scale) / h);
    gl.uniform3f(uniform.u_center, ...center);
    gl.uniform1f(uniform.u_flip, mode === 'section' ? 0 : 1);
    gl.uniform1f(uniform.u_explode, explode);
    gl.uniform1f(uniform.u_selected, selected ? groups.findIndex((g) => g[0] === selected) : -1);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.uniform1f(uniform.u_pass, selected ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    if (selected) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform1f(uniform.u_pass, 2);
      gl.drawArrays(gl.TRIANGLES, 0, count);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    drawLabels(w, h, scale, center);
  }
  function drawLabels(w, h, scale, center) {
    const lines = root.querySelector('.part-lines'),
      labels = root.querySelector('.part-labels');
    const focusedPin = labels.contains(document.activeElement)
      ? document.activeElement.dataset.pin
      : null;
    lines.replaceChildren();
    labels.replaceChildren();
    labels.hidden = !learning;
    if (!learning) return;
    lines.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const ids =
      mode === 'body'
        ? ['upper', 'under', 'spar', 'ribs', 'web-core']
        : ['upper', 'under', 'web-core', 'roving', 'belt'];
    ids.forEach((id, i) => {
      const a = (rootZoom ? rootAnchors : anchorSets[mode === 'body' ? 'body' : 'local'])[id];
      if (!a) return;
      let p = a.point.map((v, k) => v - center[k]);
      p[1] += a.lift * 0.13 * explode;
      if (mode !== 'section') {
        p[1] *= -1;
        p[2] *= -1;
      }
      let c = Math.cos(yaw),
        s = Math.sin(yaw),
        q = [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c],
        x = w / 2 + q[0] * scale,
        y = h / 2 - (q[1] * Math.cos(pitch) - q[2] * Math.sin(pitch)) * scale;
      if (x < 0 || x > w || y < 0 || y > h) return;
      const labelX = i % 2 === 0 ? 8 : w - (w < 480 ? 90 : 112),
        labelY = 18 + (Math.floor(i / 2) * (h - 65)) / 3;
      let b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.dataset.pin = id;
      b.style.left = labelX + 'px';
      b.style.top = labelY + 'px';
      b.setAttribute('aria-pressed', String(selected === id));
      b.textContent = groups.find((g) => g[0] === id)[1];
      b.onclick = () => {
        selected = selected === id ? null : id;
        legend();
        details();
        draw();
      };
      labels.append(b);
      if (focusedPin === id) b.focus({ preventScroll: true });
      let line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', `M${x},${y} L${labelX + 30},${labelY + 16}`);
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke-width', '1');
      lines.append(line);
      let dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', 'currentColor');
      lines.append(dot);
    });
  }
  const explanations = {
    upper:
      'アッパー（upper） — 前縁を回り込み、下面側に重ね代を持つ外皮。作業台に置き、ウェブ・桁リブ・ペラスパーを取り付ける。',
    under:
      'アンダー（under） — upperの上から被せる外皮。内側にはロービングと黒帯を積層しておき、ウェブの位置へ合わせて接着する。',
    spar: 'ペラスパー — 回転中心とブレードをつなぐカーボン製の管。半径30〜330 mm、長さ300 mm。3か所の桁リブで外皮に固定する。',
    ribs: '桁リブ — スパーと外皮をつなぐ3Dプリント部品。半径130〜140、210〜220、290〜300 mmに配置する。',
    'web-core':
      'ウェブ材 — 厚さ2 mmのバルサを両面のマイクロガラスで挟む。スパー終端の半径330 mmから続き、上下のフランジをつなぐ。',
    roving:
      'カーボンロービング — 長手方向の繊維束。外皮に沿うフランジとなり、ウェブと一緒にI字梁を構成して曲げを受け持つ。',
    belt: '黒帯 — 開繊平織カーボンクロス。ロービングを覆い、外皮からウェブへ荷重を伝える狙いで入れている。',
    glass: 'マイクロガラスクロス — ウェブのバルサ両面を±45°の配向で挟む薄いガラス繊維のクロス。',
    foam: '発泡ウレタン — 前縁の内側に入れた補強材。重量が大きいため、素材変更や小型化を検討している。',
    putty: '後縁パテ — 後縁の貼り合わせ部に盛り、upperとunderを接着する。',
  };
  function details() {
    root.querySelector('[data-detail]').textContent = selected
      ? explanations[selected]
      : learning
        ? '図のラベルか部材名を選ぶと、位置と役割を確認できます。'
        : '';
    root.querySelector('[data-orientation]').textContent =
      mode === 'section' ? '翼型断面の向きで表示' : '下：upper一式 ／ 上：under';
  }
  function legend() {
    let model = mode === 'body' ? data.body : data.local,
      container = root.querySelector('[data-legend]');
    const focusedGroup = container.contains(document.activeElement)
      ? document.activeElement.dataset.group
      : null;
    container.replaceChildren();
    for (const [id, label] of groups) {
      let p = model.parts.find((p) => p.group === id);
      if (!p) continue;
      let b = document.createElement('button');
      b.className = 'btn btn-ghost';
      b.type = 'button';
      b.setAttribute('aria-pressed', String(selected === id));
      b.dataset.group = id;
      let dot = document.createElement('span');
      dot.className = 'material-dot';
      dot.style.backgroundColor = p.color;
      dot.setAttribute('aria-hidden', 'true');
      b.append(dot, document.createTextNode(label));
      b.onclick = () => {
        selected = selected === id ? null : id;
        legend();
        details();
        draw();
      };
      container.append(b);
      if (focusedGroup === id) b.focus({ preventScroll: true });
    }
  }
  function sync() {
    controls.yaw.value = Math.round((yaw * 180) / Math.PI);
    controls.pitch.value = Math.round((pitch * 180) / Math.PI);
    controls.explode.value = Math.round(explode * 100);
    root.querySelector('[data-value="explode"]').textContent = Math.round(explode * 100) + '%';
    draw();
  }
  for (const [key, e] of Object.entries(controls))
    e.oninput = () => {
      token++;
      if (key === 'yaw') yaw = (+e.value * Math.PI) / 180;
      if (key === 'pitch') pitch = (+e.value * Math.PI) / 180;
      if (key === 'explode') explode = +e.value / 100;
      sync();
    };
  for (const b of root.querySelectorAll('[data-view]'))
    b.onclick = () => {
      token++;
      mode = b.dataset.view;
      selected = null;
      rootZoom = false;
      root.querySelector('[data-action="root"]').hidden = mode !== 'body';
      root.querySelector('[data-action="root"]').setAttribute('aria-pressed', 'false');
      yaw = mode === 'body' ? -0.209 : mode === 'local' ? -0.576 : 0;
      pitch = mode === 'body' ? Math.PI / 3 : mode === 'local' ? 0.384 : 0;
      root
        .querySelectorAll('[data-view]')
        .forEach((e) => e.setAttribute('aria-pressed', String(e === b)));
      legend();
      details();
      upload();
      sync();
    };
  root.querySelector('[data-action="root"]').onclick = (e) => {
    rootZoom = !rootZoom;
    e.currentTarget.setAttribute('aria-pressed', String(rootZoom));
    draw();
  };
  root.querySelector('[data-action="learn"]').onclick = (e) => {
    learning = !learning;
    selected = null;
    e.currentTarget.setAttribute('aria-pressed', String(learning));
    root.querySelector('[data-legend]').hidden = !learning;
    legend();
    details();
    draw();
  };
  root.querySelector('[data-action="assemble"]').onclick = () => {
    let id = ++token;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      explode = 0;
      sync();
      return;
    }
    let start = performance.now(),
      from = explode > 0 ? explode : 1;
    explode = from;
    sync();
    const tick = (now) => {
      if (id !== token) return;
      let t = Math.min(1, (now - start) / 2600);
      explode = from * (1 - t * t * (3 - 2 * t));
      sync();
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  let drag = null;
  canvas.onpointerdown = (e) => {
    token++;
    drag = { x: e.clientX, y: e.clientY, yaw, pitch };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!drag) return;
    yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
    pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.006));
    sync();
  };
  canvas.onpointerup = canvas.onpointercancel = () => (drag = null);
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  legend();
  details();
  upload();
  sync();
  if (initialLocal) root.querySelector('[data-view="local"]').click();
  return () => {
    token++;
    observer.disconnect();
    gl.deleteBuffer(buffer);
    gl.getAttachedShaders(program)?.forEach((s) => gl.deleteShader(s));
    gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
