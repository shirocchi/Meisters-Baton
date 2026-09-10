export function initMold(root, MOLD_PROFILE) {
  const stages = [
    ['基準を組む', '木箱にアクリル板を固定し、櫛で位置を出してステンレスの断面板を立てる。'],
    ['スタイロを入れる', '切り出したスタイロを断面板の間へ入れ、雄型の下地を作る。'],
    ['表面を仕上げる', '保護樹脂で覆い、溝を埋め、パテ・やすり・サフで連続した製品面に仕上げる。'],
    [
      '離型処理・ゲルコート',
      '仕上げた雄型を離型処理し、ゲルコートを塗る。ここが雌型の製品面になる。',
    ],
    [
      '大積層で雌型を作る',
      '雄型の面を写し取りながらFRPを積層する。側面と後縁側も空気を残さず追う。',
    ],
    ['雄型から外す', '硬化した雌型を脱型する。雄型の凸面を写した、凹んだ製品面が得られる。'],
    [
      '雌型で外皮を作る',
      '雌型の内側を使って、CFRP・バルサ・CFRPの外皮を成形する。型とブレード外皮は別のもの。',
    ],
  ];
  let side = 'upper',
    progress = 0,
    playing = false,
    frame = 0,
    token = 0;
  const svg = root.querySelector('#mold-svg'),
    slider = root.querySelector('#mold-progress'),
    play = root.querySelector('#play');
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)),
    mix = (a, b, t) => a + (b - a) * t;
  const pts = () =>
    MOLD_PROFILE[side]
      .filter((_, i) => i % 2 === 0)
      .map(([x, y]) => [145 + x * 320, 285 - (side === 'upper' ? y : -y) * 320]);
  const pathOf = (p) => 'M' + p.map((q) => q.map((v) => v.toFixed(2)).join(',')).join(' L');
  const poly = (points, fill, stroke = '#66766e') =>
    `<path d="${pathOf(points)}Z" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
  const move = (points, dx, dy) => points.map(([x, y]) => [x + dx, y + dy]);
  function label(x, y, text, tx, ty) {
    const size = Math.max(14, (11 * 800) / Math.max(280, svg.clientWidth));
    const right = x > 400;
    if (right) x = 772;
    return `<path d="M${x},${y + 7}L${tx},${ty}" stroke="#748078" fill="none"/><circle cx="${tx}" cy="${ty}" r="3" fill="#174c43"/><text x="${x}" y="${y}" text-anchor="${right ? 'end' : 'start'}" fill="#25342f" font-family="sans-serif" font-size="${size}">${text}</text>`;
  }
  function sheet(curve, thickness, fill, dy = 0) {
    const front = move(curve, 0, dy),
      back = move(front, 190, -82),
      bottom = move(front, 0, thickness),
      farBottom = move(back, 0, thickness);
    return (
      poly([...front, ...back.slice().reverse()], fill) +
      poly([...front, ...bottom.slice().reverse()], fill) +
      poly(
        [
          front[front.length - 1],
          back[back.length - 1],
          farBottom[farBottom.length - 1],
          bottom[bottom.length - 1],
        ],
        fill,
      )
    );
  }
  function draw() {
    const s = progress / 100,
      c = pts(),
      foam = clamp(s),
      finish = clamp(s - 1),
      gel = clamp(s - 2),
      laminate = clamp(s - 3),
      separate = clamp(s - 4),
      use = clamp(s - 5);
    let contents = `<title>雄型から雌型へ：${stages[Math.round(s)][0]}</title><defs><pattern id="carbon" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#444e51"/><path d="M0 0L9 9M-4 4L4 12M5 -3L12 4" stroke="#667075" stroke-width="3"/></pattern></defs>`;
    // Section plates and blocks describe the construction; their count and
    // spacing deliberately carry no dimensional claim.
    const base = [
      [113, 330],
      [476, 330],
      [685, 240],
      [322, 240],
    ];
    contents +=
      `<g opacity="${1 - use}">` +
      poly(move(base, 0, 18), '#b99a68') +
      poly([base[0], base[1], [476, 348], [113, 348]], '#b19266') +
      poly(base, '#d3ba91');
    contents += poly(
      [
        [127, 322],
        [468, 322],
        [667, 236],
        [326, 236],
      ],
      '#dae5e2',
    );
    for (let i = 7; i >= 0; i--) {
      const dx = (i * 190) / 7,
        dy = (-i * 82) / 7,
        rib = move(c, dx, dy);
      if (i < 7 && foam > 0) {
        let segment = [...rib, ...move(c, dx + 25, dy - 11).reverse()];
        contents +=
          `<g opacity="${foam}">` +
          poly(segment, '#a9d7df') +
          poly([...rib, [465 + dx, 322 + dy], [145 + dx, 322 + dy]], '#9dcbd4') +
          '</g>';
      }
      contents += poly([...rib, [465 + dx, 322 + dy], [145 + dx, 322 + dy]], '#abb4b6', '#788486');
    }
    if (finish > 0) contents += `<g opacity="${finish}">` + sheet(c, 6, '#b6c8bc', -4) + '</g>';
    contents += '</g>';
    const lift = separate * 110;
    if (gel > 0) {
      contents += `<g opacity="${gel * (1 - use)}">` + sheet(c, 4, '#f1eee2', -10 - lift) + '</g>';
    }
    if (laminate > 0) {
      contents +=
        `<g opacity="${laminate * (1 - use)}">` + sheet(c, 9, 'url(#carbon)', -20 - lift) + '</g>';
    }
    if (use > 0) {
      let female = c.map(([x, y]) => [x, 290 - (285 - y)]);
      female = female.map(([x, y]) => [x, 330 - y + 160]);
      contents +=
        `<g opacity="${use}">` +
        sheet(female, 15, 'url(#carbon)') +
        sheet(female, 4, '#f1eee2', -4) +
        sheet(female, 3, '#6a7377', -14 - use * 36) +
        '</g>';
    }
    const idx = Math.round(s);
    if (idx === 0) {
      contents +=
        label(32, 100, 'ステンレス断面板', 337, 240) +
        label(522, 355, '木箱・アクリル板', 474, 325);
    }
    if (idx === 1) {
      contents +=
        label(40, 100, 'スタイロの下地', 373, 230) +
        label(516, 355, '位置を決める櫛・土台', 477, 320);
    }
    if (idx === 2) {
      contents +=
        label(44, 92, '保護樹脂・パテ・サフ', 334, 221) +
        label(496, 355, '連続した製品面を作る', 487, 208);
    }
    if (idx === 3) {
      contents += label(42, 80, 'ゲルコート', 331, 212) + label(534, 355, '下側は雄型', 472, 290);
    }
    if (idx === 4) {
      contents +=
        label(38, 70, '雌型になるFRP', 331, 200) + label(534, 355, '下側は雄型', 472, 290);
    }
    if (idx === 5) {
      contents +=
        label(35, 60, '脱型した雌型', 330, 92) + label(534, 355, '形を写した後の雄型', 473, 290);
    }
    if (idx === 6) {
      contents +=
        label(34, 62, '成形するブレード外皮', 323, 132) + label(539, 335, '雌型の製品面', 478, 196);
    }
    svg.innerHTML = contents;
    root.querySelector('#stage-number').textContent = String(idx + 1).padStart(2, '0');
    root.querySelector('#stage-title').textContent = stages[idx][0];
    root.querySelector('#stage-detail').textContent = stages[idx][1];
    slider.value = progress;
    root
      .querySelectorAll('[data-stage]')
      .forEach((b) => b.setAttribute('aria-current', +b.dataset.stage === idx ? 'step' : 'false'));
    root.querySelector('#prev').disabled = idx === 0;
    root.querySelector('#next').disabled = idx === 6;
  }
  function stop() {
    token++;
    cancelAnimationFrame(frame);
    playing = false;
    play.textContent = '工程を再生';
  }
  function go(value, animate = true) {
    stop();
    value = clamp(value, 0, 600);
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      progress = value;
      draw();
      return;
    }
    let from = progress,
      start = performance.now(),
      id = token;
    const tick = (now) => {
      if (id !== token) return;
      let t = clamp((now - start) / 850);
      progress = mix(from, value, t * t * (3 - 2 * t));
      draw();
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  root.querySelector('#mold-steps').innerHTML = stages
    .map(
      (s, i) =>
        `<button data-stage="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${s[0]}</button>`,
    )
    .join('');
  root
    .querySelectorAll('[data-stage]')
    .forEach((b) => (b.onclick = () => go(+b.dataset.stage * 100)));
  root.querySelectorAll('[data-side]').forEach(
    (b) =>
      (b.onclick = () => {
        side = b.dataset.side;
        root
          .querySelectorAll('[data-side]')
          .forEach((e) => e.setAttribute('aria-pressed', e === b));
        draw();
      }),
  );
  root.querySelector('#prev').onclick = () => go((Math.round(progress / 100) - 1) * 100);
  root.querySelector('#next').onclick = () => go((Math.round(progress / 100) + 1) * 100);
  slider.oninput = () => go(+slider.value, false);
  play.onclick = () => {
    if (playing) {
      stop();
      return;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      go(600, false);
      return;
    }
    stop();
    playing = true;
    play.textContent = '一時停止';
    let from = progress >= 600 ? 0 : progress,
      start = performance.now(),
      id = token;
    const tick = (now) => {
      if (id !== token) return;
      progress = Math.min(600, from + (now - start) / 17);
      draw();
      if (progress < 600) frame = requestAnimationFrame(tick);
      else stop();
    };
    frame = requestAnimationFrame(tick);
  };
  root.querySelector('#save-svg').onclick = () => {
    const copy = svg.cloneNode(true);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const url = URL.createObjectURL(new Blob([copy.outerHTML], { type: 'image/svg+xml' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `meister-mold-${side}-${Math.round(progress / 100) + 1}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const observer = new ResizeObserver(draw);
  observer.observe(svg);
  draw();
  return () => {
    stop();
    observer.disconnect();
  };
}
