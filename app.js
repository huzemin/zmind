/* ============================================================
   ZMind · 思维导图
   无限画布 / 弹性布局 / 拖拽改层级 / 三套主题 / 导出
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const KEY = 'zmind.doc.v1';
  const LEGACY_KEY = 'aurelia.doc.v1';
  let uidc = 0;
  const uid = () => 'n' + (++uidc).toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------------- 设计常量 ---------------- */
  const SIZES = {
    0: { maxW: 340, padX: 28, padY: 18, fs: 21, fw: 650, lh: 1.32 },
    1: { maxW: 260, padX: 17, padY: 12, fs: 15.5, fw: 600, lh: 1.4 },
    2: { maxW: 240, padX: 15, padY: 10, fs: 14, fw: 500, lh: 1.46 }
  };

  const GAP = { x: 64, y: 18, dx: 30, dy: 58 };

  const THEMES = {
    obsidian: {
      label: '曜石',
      accent: '#E6C79A', goldInk: '#1A1409', ink: '#F5F2EC', bg: '#08090B',
      palette: ['#E6C79A', '#E39BA4', '#A9C7A2', '#9CB3DC', '#DE9E78', '#BFA8E0', '#8FD1C6', '#D6C58E']
    },
    aurora: {
      label: '极光',
      accent: '#9FE8CF', goldInk: '#04120E', ink: '#EAF7F3', bg: '#04100F',
      palette: ['#9FE8CF', '#8FD3E8', '#A9B6F2', '#C9ADEE', '#7FDDD4', '#BCE58F', '#E8CF9A', '#EFAAB0']
    },
    ivory: {
      label: '象牙',
      accent: '#A9762B', goldInk: '#FFF9EE', ink: '#1A1815', bg: '#F3EFE7',
      palette: ['#A9762B', '#BE5A6B', '#4E7A46', '#3D628F', '#B25A30', '#6B4C93', '#2C7F76', '#8A7420']
    },
    rose: {
      label: '暮玫',
      accent: '#E8A7B8', goldInk: '#2A0F18', ink: '#F7EEF1', bg: '#120A0E',
      palette: ['#E8A7B8', '#E0B49E', '#D9A0C0', '#A8C0DE', '#C9B8E8', '#A0D0C8', '#E0C8A0', '#DE9E9E']
    },
    indigo: {
      label: '靛蓝',
      accent: '#9FB4E8', goldInk: '#0A1226', ink: '#EAEFF8', bg: '#0A0D18',
      palette: ['#9FB4E8', '#8FD8E0', '#B4A8E8', '#9FD0B4', '#E0C0A0', '#E8A8C0', '#A0B8E0', '#C8D08E']
    },
    moss: {
      label: '苔绿',
      accent: '#B8D89E', goldInk: '#10200F', ink: '#EFF5EC', bg: '#0A120C',
      palette: ['#B8D89E', '#8FC8B4', '#D8C88E', '#E0A88F', '#A8C4E0', '#C8A8D8', '#9EC8D8', '#D0A8A0']
    },
    plum: {
      label: '暮紫',
      accent: '#C8A8E0', goldInk: '#1C0F2A', ink: '#F3EDF8', bg: '#100A16',
      palette: ['#C8A8E0', '#E0A8C8', '#A8C0E0', '#9ED8C8', '#D8C098', '#A0D0E0', '#D8A8A0', '#B0D8A0']
    }
  };

  /* ---------------- DOM ---------------- */
  const canvas = $('#canvas');
  const world = $('#world');
  const edgeLayer = $('#edges');
  const grid = $('#grid');
  const toolbar = $('#toolbar');
  const palette = $('#palette');
  const menu = $('#menu');
  const outline = $('#outline');
  const zoomLabel = $('#zoomLabel');
  const toastEl = $('#toast');
  const dropLine = $('#dropLine');
  const titleEl = $('#title');

  /* ---------------- 状态 ---------------- */
  let doc = null;
  let metas = new Map();
  const RT = new Map();
  let edges = [];
  let selId = null;
  let editingId = null;
  let editOriginal = '';
  let view = { x: 0, y: 0, k: 1 };
  let history = [];
  let hIndex = -1;
  let structSig = '';
  let pan = null;
  let drag = null;
  let dragPreview = null;
  let spaceDown = false;
  let saveTimer = 0;
  let userMoved = false;
  let swapping = false;
  const COARSE = window.matchMedia('(pointer: coarse)').matches;

  /* ---------------- 文本测量 ---------------- */
  const measureEl = document.createElement('div');
  measureEl.className = 'n-measure';
  document.body.appendChild(measureEl);
  const mcache = new Map();

  function measure(text, depth) {
    const d = Math.min(depth, 2);
    const key = d + '|' + text;
    const hit = mcache.get(key);
    if (hit) return hit;
    measureEl.dataset.d = d;
    measureEl.style.maxWidth = SIZES[d].maxW + 'px';
    measureEl.textContent = text || ' ';
    const r = measureEl.getBoundingClientRect();
    const out = { w: Math.ceil(r.width) + 2, h: Math.ceil(r.height) + 2 };
    if (mcache.size > 1200) mcache.clear();
    mcache.set(key, out);
    return out;
  }

  /* ---------------- 布局引擎 ---------------- */
  function colorFor(n, depth, inherited, branchIdx) {
    const th = THEMES[doc.theme];
    const pal = th.palette;
    const accent = th.accent;
    if (depth === 0) return n.color != null ? pal[n.color % pal.length] : accent;
    if (n.color != null) return pal[n.color % pal.length];
    if (depth === 1) return pal[branchIdx % pal.length];
    return inherited || accent;
  }

  /* 清除历史遗留的自定义色内联变量（旧版功能已下线，载入旧存档时兜底） */
  function clearLegacyThemeVars() {
    const root = document.documentElement;
    delete root.dataset.custom;
    delete root.dataset.customMode;
    ['--accent', '--accent-ink', '--bg0', '--bg1', '--glass', '--glass-2', '--dot', '--hover', '--node-bg',
      '--a2', '--a3', '--ink', '--ink2', '--ink3', '--line', '--line2', '--seg-bg']
      .forEach((k) => root.style.removeProperty(k));
  }

  /* 有效的子节点列表：拖拽时会临时把节点挂到预览父级（含排序） */
  function kidsOf(id) {
    const n = doc.nodes[id];
    if (!n) return [];
    let kids = n.children || [];
    if (!dragPreview) return kids.filter((c) => doc.nodes[c]);
    const { childId, parentId, index, oldParentId } = dragPreview;
    if (id === oldParentId) kids = kids.filter((c) => c !== childId);
    if (id === parentId) {
      const arr = kids.slice();
      const at = clamp(index, 0, arr.length);
      arr.splice(at, 0, childId);
      kids = arr;
    }
    return kids.filter((c) => doc.nodes[c]);
  }

  /* 拖拽预览时目标父级临时展开 */
  function isCollapsedForLayout(n) {
    if (!n.collapsed) return false;
    if (dragPreview && (n.id === dragPreview.parentId || n.id === dragPreview.oldParentId)) return false;
    return true;
  }

  function computeLayout() {
    const mode = doc.layout;
    metas = new Map();
    const gapCross = mode === 'down' ? GAP.dx : GAP.y;
    const ownCross = (m) => (mode === 'down' ? m.w : m.h);

    function meas(id, depth, parentColor, branchIdx) {
      const n = doc.nodes[id];
      if (!n) return null;
      const sz = measure(n.text || ' ', depth);
      const color = colorFor(n, depth, parentColor, branchIdx);
      const m = { id, depth, w: sz.w, h: sz.h, color, kids: [], cross: 0, side: 'r', x: 0, y: 0 };
      metas.set(id, m);
      const kids = isCollapsedForLayout(n) ? [] : kidsOf(id);
      let total = 0;
      kids.forEach((cid, i) => {
        const km = meas(cid, depth + 1, color, depth === 0 ? i : branchIdx);
        if (!km) return;
        m.kids.push(cid);
        total += km.cross + (i ? gapCross : 0);
      });
      m.cross = Math.max(ownCross(m), total);
      return m;
    }
    meas(doc.rootId, 0, THEMES[doc.theme].accent, 0);

    const root = metas.get(doc.rootId);
    if (!root) return;

    const placeRight = (m, x, cy) => {
      m.x = x; m.y = cy - m.h / 2; m.side = 'r';
      if (!m.kids.length) return;
      let total = 0;
      m.kids.forEach((cid, i) => { total += metas.get(cid).cross + (i ? GAP.y : 0); });
      let cur = cy - total / 2;
      m.kids.forEach((cid) => {
        const k = metas.get(cid);
        placeRight(k, x + m.w + GAP.x, cur + k.cross / 2);
        cur += k.cross + GAP.y;
      });
    };

    const placeLeft = (m, xEdge, cy) => {
      m.x = xEdge - m.w; m.y = cy - m.h / 2; m.side = 'l';
      if (!m.kids.length) return;
      let total = 0;
      m.kids.forEach((cid, i) => { total += metas.get(cid).cross + (i ? GAP.y : 0); });
      let cur = cy - total / 2;
      m.kids.forEach((cid) => {
        const k = metas.get(cid);
        placeLeft(k, m.x - GAP.x, cur + k.cross / 2);
        cur += k.cross + GAP.y;
      });
    };

    const placeDown = (m, cx, y) => {
      m.x = cx - m.w / 2; m.y = y; m.side = 'd';
      if (!m.kids.length) return;
      let total = 0;
      m.kids.forEach((cid, i) => { total += metas.get(cid).cross + (i ? GAP.dx : 0); });
      let cur = cx - total / 2;
      m.kids.forEach((cid) => {
        const k = metas.get(cid);
        placeDown(k, cur + k.cross / 2, y + m.h + GAP.dy);
        cur += k.cross + GAP.dx;
      });
    };

    if (mode === 'balanced') {
      root.x = 0; root.y = -root.h / 2; root.side = 'r';
      const kids = root.kids.map((id) => metas.get(id));
      const half = Math.ceil(kids.length / 2);
      const groups = [
        { list: kids.slice(0, half), anchor: root.w + GAP.x, side: 'r' },
        { list: kids.slice(half), anchor: -GAP.x, side: 'l' }
      ];
      groups.forEach((g) => {
        if (!g.list.length) return;
        let total = 0;
        g.list.forEach((k, i) => { total += k.cross + (i ? GAP.y : 0); });
        let cur = -total / 2;
        g.list.forEach((k) => {
          if (g.side === 'r') placeRight(k, g.anchor, cur + k.cross / 2);
          else placeLeft(k, g.anchor, cur + k.cross / 2);
          cur += k.cross + GAP.y;
        });
      });
    } else if (mode === 'down') {
      placeDown(root, 0, 0);
    } else {
      placeRight(root, 0, 0);
    }
  }

  function bounds() {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    metas.forEach((m) => {
      x1 = Math.min(x1, m.x); y1 = Math.min(y1, m.y);
      x2 = Math.max(x2, m.x + m.w); y2 = Math.max(y2, m.y + m.h);
    });
    if (!isFinite(x1)) return { x: 0, y: 0, w: 100, h: 100 };
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /* ---------------- 渲染 ---------------- */
  function createEl(id, depth) {
    const el = document.createElement('div');
    el.className = 'n enter';
    el.dataset.id = id;
    el.style.setProperty('--pop-delay', Math.min(depth, 4) * 70 + 'ms');
    el.innerHTML = '<div class="n-inner"><span class="n-text"></span></div>' +
      '<button class="n-toggle" tabindex="-1" aria-label="折叠"></button>';
    const toggle = el.querySelector('.n-toggle');
    toggle.addEventListener('pointerdown', (e) => e.stopPropagation());
    toggle.addEventListener('click', (e) => { e.stopPropagation(); toggleCollapse(id); });
    el.addEventListener('pointerdown', onNodePointerDown);
    el.addEventListener('dblclick', (e) => { e.stopPropagation(); select(id); startEdit(id); });
    el.addEventListener('mouseenter', () => highlightPath(id, true));
    el.addEventListener('mouseleave', () => highlightPath(id, false));
    const span = el.querySelector('.n-text');
    span.addEventListener('input', () => onEditInput(id));
    span.addEventListener('keydown', (e) => onEditKey(e, id));
    span.addEventListener('blur', () => {
      if (swapping || !rt.el.isConnected) return;
      endEdit(id);
    });
    setTimeout(() => el.classList.remove('enter'), 720);
    return el;
  }

  function render() {
    const alive = new Set();
    const sigParts = [];

    metas.forEach((m) => {
      alive.add(m.id);
      const n = doc.nodes[m.id];
      if (!n) return;
      let rt = RT.get(m.id);
      if (!rt) {
        const el = createEl(m.id, m.depth);
        rt = { id: m.id, el, cx: m.x, cy: m.y, tx: m.x, ty: m.y, offX: 0, offY: 0, m };
        RT.set(m.id, rt);
        el.style.transform = `translate3d(${m.x}px,${m.y}px,0)`;
        world.appendChild(el);
      }
      rt.m = m; rt.tx = m.x; rt.ty = m.y;
      const e = rt.el;
      e.style.width = m.w + 'px';
      e.style.height = m.h + 'px';
      e.style.setProperty('--c', m.color);
      e.dataset.d = Math.min(m.depth, 2);
      e.classList.toggle('sel', m.id === selId);
      e.classList.toggle('collapsed', !!n.collapsed && n.children.length > 0);
      e.classList.toggle('side-l', m.side === 'l');

      if (!rt.editing) {
        const span = e.querySelector('.n-text');
        const txt = n.text || '';
        if (span.textContent !== txt) span.textContent = txt;
      }
      const tg = e.querySelector('.n-toggle');
      if (n.children.length) {
        tg.style.display = 'grid';
        tg.textContent = n.collapsed ? String(n.children.length) : '';
      } else {
        tg.style.display = 'none';
      }
      m.kids.forEach((cid) => sigParts.push(m.id + '>' + cid));
    });

    RT.forEach((rt, id) => {
      if (!alive.has(id)) { rt.el.remove(); RT.delete(id); }
    });

    const sig = sigParts.join('|');
    if (sig !== structSig) { structSig = sig; rebuildEdges(); }
    world.dataset.layout = doc.layout;
    if (!editingId) updateOutline();
    drawEdges();
    updateToolbar();
    drawMinimap();
  }

  function geoFor(px, py, pw, ph, cx, cy, cw, ch, side, mode) {
    if (mode === 'down') {
      const x1 = px + pw / 2, y1 = py + ph, x2 = cx + cw / 2, y2 = cy;
      const d = Math.max(18, (y2 - y1) * 0.5);
      return { x1, y1, x2, y2, c1x: x1, c1y: y1 + d, c2x: x2, c2y: y2 - d };
    }
    if (side === 'l') {
      const x1 = px, y1 = py + ph / 2, x2 = cx + cw, y2 = cy + ch / 2;
      const d = Math.max(28, (x1 - x2) * 0.45);
      return { x1, y1, x2, y2, c1x: x1 - d, c1y: y1, c2x: x2 + d, c2y: y2 };
    }
    const x1 = px + pw, y1 = py + ph / 2, x2 = cx, y2 = cy + ch / 2;
    const d = Math.max(28, (x2 - x1) * 0.45);
    return { x1, y1, x2, y2, c1x: x1 + d, c1y: y1, c2x: x2 - d, c2y: y2 };
  }

  function rebuildEdges() {
    edges = [];
    edgeLayer.textContent = '';
    metas.forEach((m) => {
      m.kids.forEach((cid) => {
        const c = metas.get(cid);
        if (!c) return;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('stroke', c.color);
        p.setAttribute('stroke-width', c.depth === 1 ? 2.1 : 1.5);
        p.setAttribute('stroke-opacity', c.depth === 1 ? 0.72 : 0.5);
        p.dataset.cid = cid;
        edgeLayer.appendChild(p);
        edges.push({ pid: m.id, cid, el: p });
      });
    });
    drawEdges();
  }

  function drawEdges() {
    for (let i = 0; i < edges.length; i++) {
      const ed = edges[i];
      const p = RT.get(ed.pid), c = RT.get(ed.cid);
      if (!p || !c) continue;
      const g = geoFor(
        p.cx + (p.offX || 0), p.cy + (p.offY || 0), p.m.w, p.m.h,
        c.cx + (c.offX || 0), c.cy + (c.offY || 0), c.m.w, c.m.h,
        c.m.side, doc.layout);
      const d = `M${g.x1},${g.y1} C${g.c1x},${g.c1y} ${g.c2x},${g.c2y} ${g.x2},${g.y2}`;
      if (ed.el.getAttribute('d') !== d) ed.el.setAttribute('d', d);
    }
  }

  /* ---------------- 动画循环 ---------------- */
  let lastTick = 0;

  let tickScheduled = false;
  let tickFallback = 0;

  function tick() {
    const now = performance.now();
    const dt = lastTick ? Math.min(64, now - lastTick) : 16;
    lastTick = now;
    // 0.22/16ms 的等效指数衰减，与帧率无关
    const ease = 1 - Math.exp(-14.5 * (dt / 1000));
    let moving = false;
    const dragging = !!(drag && drag.active);
    let subX = 0, subY = 0;

    if (dragging) {
      const dm = metas.get(drag.id);
      if (dm) { subX = drag.ghostX - dm.x; subY = drag.ghostY - dm.y; }
      moving = true;
    }

    RT.forEach((rt) => {
      // 被拖拽的节点直接贴住指针，不参与缓动
      if (dragging && rt.id === drag.id) {
        rt.cx = drag.ghostX;
        rt.cy = drag.ghostY;
        rt.offX = 0;
        rt.offY = 0;
        rt.el.style.transform = `translate3d(${rt.cx}px,${rt.cy}px,0)`;
        return;
      }
      // 每帧重置偏移；被拖子树在下方重新赋值（避免 undefined 参与 transform 计算）
      let ox = 0, oy = 0;
      if (dragging && drag.subtree && drag.subtree.has(rt.id)) {
        ox = subX;
        oy = subY;
      }
      rt.offX = ox;
      rt.offY = oy;

      const dx = rt.tx - rt.cx, dy = rt.ty - rt.cy;
      if (Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15) {
        rt.cx += dx * ease;
        rt.cy += dy * ease;
        if (Math.abs(rt.tx - rt.cx) < 0.15) rt.cx = rt.tx;
        if (Math.abs(rt.ty - rt.cy) < 0.15) rt.cy = rt.ty;
        moving = true;
      } else {
        rt.cx = rt.tx; rt.cy = rt.ty;
      }
      rt.el.style.transform = `translate3d(${rt.cx + ox}px,${rt.cy + oy}px,0)`;
    });

    drawEdges();
    updateToolbar();
    drawMinimap();
    if (moving) kick();
  }

  /* rAF + 定时器双通道：rAF 被节流（后台/省电）时动画依然推进 */
  function kick() {
    if (tickScheduled) return;
    tickScheduled = true;
    requestAnimationFrame(() => {
      if (!tickScheduled) return;
      tickScheduled = false;
      if (tickFallback) { clearTimeout(tickFallback); tickFallback = 0; }
      tick();
    });
    tickFallback = setTimeout(() => {
      if (!tickScheduled) return;
      tickScheduled = false;
      tickFallback = 0;
      tick();
    }, 24);
  }

  function relayout() {
    if (swapping) return;
    computeLayout();
    render();
    kick();
  }

  /* ---------------- 视图 ---------------- */
  function applyView() {
    world.style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.k})`;
    const gs = 26 * view.k;
    grid.style.backgroundSize = gs + 'px ' + gs + 'px';
    grid.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
    zoomLabel.textContent = Math.round(view.k * 100) + '%';
    updateToolbar();
    drawMinimap();
  }

  function zoomAt(factor, px, py) {
    userMoved = true;
    let k2 = clamp(view.k * factor, 0.2, 2.8);
    if (Math.abs(k2 - 1) < 0.03) k2 = 1;   // 接近 100% 时吸附，方便精确回到实际大小
    const f = k2 / view.k;
    view.x = px - (px - view.x) * f;
    view.y = py - (py - view.y) * f;
    view.k = k2;
    applyView();
  }

  let viewAnim = 0;

  function animateView(target, dur) {
    dur = dur || 460;
    const token = ++viewAnim;
    const from = { x: view.x, y: view.y, k: view.k };
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    (function step(now) {
      if (token !== viewAnim) return;   // 已被新的视图设置取代
      const t = Math.min(1, (now - t0) / dur);
      const e = ease(t);
      view.x = from.x + (target.x - from.x) * e;
      view.y = from.y + (target.y - from.y) * e;
      view.k = from.k + (target.k - from.k) * e;
      applyView();
      if (t < 1) requestAnimationFrame(step);
    })(performance.now());
  }

  function fit(animate) {
    const b = bounds();
    const pad = 128;
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    const k = clamp(Math.min((vw - pad * 2) / Math.max(b.w, 1), (vh - pad * 2) / Math.max(b.h, 1)), 0.32, 1);
    const target = { k, x: vw / 2 - (b.x + b.w / 2) * k, y: vh / 2 - (b.y + b.h / 2) * k };
    if (animate) animateView(target);
    else { view.x = target.x; view.y = target.y; view.k = target.k; applyView(); }
  }

  /* 跳到实际大小 100%（保持当前视图中心对准同一世界坐标） */
  function set100(animate) {
    userMoved = true;
    const cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2;
    const k2 = 1;
    const f = k2 / view.k;
    const target = { k: k2, x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f };
    if (animate) animateView(target, 380);
    else { view.x = target.x; view.y = target.y; view.k = target.k; applyView(); }
  }

  function ensureVisible(id) {
    const rt = RT.get(id);
    if (!rt) return;
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    const m = 120;
    const sx = view.x + rt.cx * view.k;
    const sy = view.y + rt.cy * view.k;
    const w = rt.m.w * view.k, h = rt.m.h * view.k;
    let dx = 0, dy = 0;
    if (sx < m) dx = m - sx;
    else if (sx + w > vw - m) dx = vw - m - (sx + w);
    if (sy < m + 70) dy = m + 70 - sy;
    else if (sy + h > vh - m) dy = vh - m - (sy + h);
    if (dx || dy) animateView({ k: view.k, x: view.x + dx, y: view.y + dy }, 380);
  }

  function centerOn(id) {
    const rt = RT.get(id);
    if (!rt) return;
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    animateView({
      k: view.k,
      x: vw / 2 - (rt.tx + rt.m.w / 2) * view.k,
      y: vh / 2 - (rt.ty + rt.m.h / 2) * view.k
    }, 440);
  }

  /* ---------------- 选择 / 工具条 ---------------- */
  function select(id) {
    selId = id || null;
    RT.forEach((rt, rid) => rt.el.classList.toggle('sel', rid === selId));
    palette.classList.remove('show');
    updateToolbar();
    if (!editingId) updateOutline();
  }

  function updateToolbar() {
    // 拖拽进行中：工具条保持隐藏，避免每帧跟随被拖节点造成闪烁
    if (drag && drag.active) { toolbar.classList.remove('show'); return; }
    toolbar.classList.toggle('is-root', selId === doc.rootId);
    if (!selId || editingId || !RT.has(selId)) {
      toolbar.classList.remove('show');
      return;
    }
    const rt = RT.get(selId);
    const sx = view.x + rt.cx * view.k;
    const sy = view.y + rt.cy * view.k;
    const sw = rt.m.w * view.k;
    const sh = rt.m.h * view.k;
    const tw = toolbar.offsetWidth || 320;
    let left = clamp(sx + sw / 2, tw / 2 + 14, window.innerWidth - tw / 2 - 14);
    let below = false;
    let top = sy - 14;
    if (sy < 132) { top = sy + sh + 14; below = true; }
    toolbar.classList.toggle('below', below);
    toolbar.classList.add('show');
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';

    if (palette.classList.contains('show')) {
      const tb = toolbar.getBoundingClientRect();
      const pw = palette.offsetWidth || 172;
      const ph = palette.offsetHeight || 118;
      const px = clamp(tb.left + tb.width / 2, pw / 2 + 14, window.innerWidth - pw / 2 - 14);
      let py = tb.top - ph - 8;
      if (py < 74) py = tb.bottom + 8;
      palette.style.left = px + 'px';
      palette.style.top = py + 'px';
    }
  }

  function hideToolbar() {
    toolbar.classList.remove('show');
    palette.classList.remove('show');
  }

  function highlightPath(id, on) {
    if (editingId) return;
    const chain = [];
    let cur = doc.nodes[id];
    while (cur) { chain.push(cur.id); cur = cur.parentId ? doc.nodes[cur.parentId] : null; }
    const set = new Set(chain);
    chain.forEach((cid) => {
      const rt = RT.get(cid);
      if (rt) rt.el.classList.toggle('lit', on);
    });
    edges.forEach((ed) => {
      if (set.has(ed.cid)) ed.el.classList.toggle('lit', on);
    });
  }

  /* ---------------- 结构编辑 ---------------- */
  function addChild(parentId) {
    const p = doc.nodes[parentId];
    if (!p) return;
    p.collapsed = false;
    const id = uid();
    doc.nodes[id] = { id, text: '新主题', parentId, children: [], collapsed: false, color: null };
    p.children.push(id);
    pushHistory();
    relayout();
    select(id);
    startEdit(id);
    ensureVisible(id);
    persist();
  }

  function addSibling(id) {
    const n = doc.nodes[id];
    if (!n) return;
    if (!n.parentId) { addChild(id); return; }
    const p = doc.nodes[n.parentId];
    const idx = p.children.indexOf(id);
    const nid = uid();
    doc.nodes[nid] = { id: nid, text: '新主题', parentId: p.id, children: [], collapsed: false, color: n.color };
    p.children.splice(idx + 1, 0, nid);
    pushHistory();
    relayout();
    select(nid);
    startEdit(nid);
    ensureVisible(nid);
    persist();
  }

  function deleteNode(id) {
    if (!id) return;
    if (id === doc.rootId) { toast('中心主题无法删除'); return; }
    const n = doc.nodes[id];
    if (!n) return;
    const parent = doc.nodes[n.parentId];
    const collect = (nid, out) => {
      out.push(nid);
      (doc.nodes[nid].children || []).forEach((c) => collect(c, out));
      return out;
    };
    const ids = collect(id, []);
    parent.children = parent.children.filter((c) => c !== id);
    ids.forEach((i) => delete doc.nodes[i]);
    selId = parent.id;
    pushHistory();
    relayout();
    persist();
    toast('已删除 ' + ids.length + ' 个主题');
  }

  function toggleCollapse(id) {
    const n = doc.nodes[id];
    if (!n || !n.children.length) return;
    n.collapsed = !n.collapsed;
    pushHistory();
    relayout();
    persist();
  }

  function isDescendant(id, ancestorId) {
    let cur = doc.nodes[id];
    while (cur) {
      if (cur.id === ancestorId) return true;
      cur = cur.parentId ? doc.nodes[cur.parentId] : null;
    }
    return false;
  }

  function reparent(childId, newParentId, index) {
    const c = doc.nodes[childId], np = doc.nodes[newParentId];
    if (!c || !np || childId === doc.rootId) return;
    if (isDescendant(newParentId, childId)) return;
    const old = doc.nodes[c.parentId];
    const oldIdx = old ? old.children.indexOf(childId) : -1;
    if (old) old.children = old.children.filter((x) => x !== childId);
    np.children = np.children.filter((x) => x !== childId);
    const at = clamp(index == null ? np.children.length : index, 0, np.children.length);
    np.children.splice(at, 0, childId);
    np.collapsed = false;
    c.parentId = newParentId;
    if (old === np && oldIdx === at) return;
    pushHistory();
    relayout();
    persist();
    toast(old === np ? '已调整顺序' : '已移动主题');
  }

  /* ---------------- 编辑 ---------------- */
  function startEdit(id, silent) {
    if (swapping) return;
    const rt = RT.get(id);
    if (!rt || rt.editing || !rt.el.isConnected) return;
    rt.editing = true;
    editingId = id;
    const span = rt.el.querySelector('.n-text');
    editOriginal = doc.nodes[id].text || '';
    span.setAttribute('contenteditable', 'true');
    span.classList.add('editing');
    rt.el.style.zIndex = 8;
    hideToolbar();
    span.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(span);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function onEditInput(id) {
    const rt = RT.get(id);
    if (!rt || !rt.editing || swapping || !rt.el.isConnected) return;
    const span = rt.el.querySelector('.n-text');
    doc.nodes[id].text = (span.innerText || '').replace(/\u00a0/g, ' ');
    computeLayout();
    render();
    kick();
  }

  function onEditKey(e, id) {
    if (swapping) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      endEdit(id);
      select(id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const rt = RT.get(id);
      if (rt) rt.el.querySelector('.n-text').textContent = editOriginal;
      doc.nodes[id].text = editOriginal;
      endEdit(id, true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      endEdit(id);
      addChild(id);
    }
    e.stopPropagation();
  }

  function endEdit(id, reverted) {
    const rt = RT.get(id);
    if (!rt || !rt.editing) return;
    if (swapping || !rt.el.isConnected) {
      rt.editing = false;
      editingId = null;
      return;
    }
    const span = rt.el.querySelector('.n-text');
    span.removeAttribute('contenteditable');
    span.classList.remove('editing');
    rt.el.style.zIndex = '';
    rt.editing = false;
    editingId = null;

    if (!reverted) {
      const txt = (span.innerText || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+$/, '')
        .replace(/^\s+/, '');
      doc.nodes[id].text = txt || '新主题';
      if (doc.nodes[id].text !== editOriginal) pushHistory();
    }
    relayout();
    persist();
    updateToolbar();
    updateOutline();
  }

  /* ---------------- 指针交互：拖拽改层级 ---------------- */
  function pointerWorld(clientX, clientY) {
    return { x: (clientX - view.x) / view.k, y: (clientY - view.y) / view.k };
  }

  function subtreeOf(id) {
    const s = new Set();
    const walk = (nid) => {
      const n = doc.nodes[nid];
      if (!n) return;
      (n.children || []).forEach((c) => {
        if (!s.has(c)) { s.add(c); walk(c); }
      });
    };
    walk(id);
    return s;
  }

  function onNodePointerDown(e) {
    if (e.button !== 0) return;
    const id = e.currentTarget.dataset.id;
    if (e.target.closest('.n-toggle')) return;
    const rt = RT.get(id);
    if (rt && rt.editing) return;
    e.stopPropagation();
    // 先结束其它节点可能遗留的编辑态，否则 editingId 卡住会导致工具条无法再弹出
    if (editingId && editingId !== id) endEdit(editingId);
    select(id);
    drag = {
      id, sx: e.clientX, sy: e.clientY, active: false, target: null,
      sig: '', vx: 0, lastX: e.clientX, t: performance.now(), pointerId: e.pointerId
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { }
  }

  /* 抬起节点：脱离布局缓动，改为直接跟手 */
  function activateDrag() {
    const d = drag;
    if (!d || d.active) return;
    const rt = RT.get(d.id);
    if (!rt) return;
    const w = pointerWorld(d.sx, d.sy);
    d.active = true;
    d.subtree = subtreeOf(d.id);
    d.offX = w.x - rt.cx;
    d.offY = w.y - rt.cy;
    d.ghostX = rt.cx;
    d.ghostY = rt.cy;
    rt.el.classList.add('dragging');
    document.body.classList.add('dragging-node');
    d.subtree.forEach((sid) => {
      const r = RT.get(sid);
      if (r) r.el.classList.add('drag-sub');
    });
    hideToolbar();
    kick();
  }

  /* 找到指针下的落点：中央＝成为子主题，上下缘＝插入为兄弟 */
  function hitTestPoint(clientX, clientY, excludeId) {
    const wx = (clientX - view.x) / view.k;
    const wy = (clientY - view.y) / view.k;
    let best = null;
    RT.forEach((rt) => {
      const m = rt.m;
      if (m.x <= wx && wx <= m.x + m.w && m.y <= wy && wy <= m.y + m.h) {
        if (m.id === excludeId) return;
        if (!best || m.depth > best.rt.m.depth) best = { rt };
      }
    });
    if (!best) return null;
    const rt = best.rt;
    const n = doc.nodes[rt.id];
    if (!n) return null;
    // 落在自己子树里 = 无效
    if (excludeId && (rt.id === excludeId || isDescendant(rt.id, excludeId))) return null;
    let zone = 'child';
    if (n.parentId) {
      // 用布局几何（排除被缩放/旋转的视觉矩形）判定上下缘，避免拖拽时落点判定抖动
      const sy = view.y + rt.m.y * view.k;
      const h = rt.m.h * view.k;
      const t = (clientY - sy) / Math.max(1, h);
      if (t < 0.3) zone = 'before';
      else if (t > 0.7) zone = 'after';
    }
    return { id: rt.id, zone };
  }

  function previewFor(hit) {
    const d = drag;
    if (!d || !hit) return null;
    const target = doc.nodes[hit.id];
    if (!target) return null;
    const oldParentId = doc.nodes[d.id] ? doc.nodes[d.id].parentId : null;
    // 基于原始顺序计算插入位置（排除自己），保证结果稳定不震荡
    const withoutSelf = (id) => ((doc.nodes[id] && doc.nodes[id].children) || []).filter((c) => c !== d.id);
    if (hit.zone === 'child') {
      return { childId: d.id, parentId: hit.id, oldParentId, index: withoutSelf(hit.id).length };
    }
    const pid = target.parentId;
    if (!pid) return null;
    const list = withoutSelf(pid);
    const at = list.indexOf(hit.id);
    if (at < 0) return null;
    return {
      childId: d.id, parentId: pid, oldParentId,
      index: hit.zone === 'after' ? at + 1 : at
    };
  }

  function updatePreview(clientX, clientY) {
    const d = drag;
    if (!d || !d.active) return;
    const hit = hitTestPoint(clientX, clientY, d.id);
    let next = previewFor(hit);
    // 指针悬在被拖节点自己的布局槽位上 → 保持上一个预览（吸附态不丢）
    if (!hit && next === null) {
      const m = metas.get(d.id);
      const w = pointerWorld(clientX, clientY);
      if (m && w.x >= m.x && w.x <= m.x + m.w && w.y >= m.y && w.y <= m.y + m.h) {
        next = dragPreview;
        updateDropLine();
        return;
      }
    }
    const sig = next ? next.parentId + '|' + next.index : '';
    if (sig === d.sig && hit) { updateDropLine(); return; }
    d.sig = sig;
    d.dropTargetId = hit ? hit.id : null;
    d.dropZone = hit ? hit.zone : null;
    // 拖拽中冻结整树布局：不再每帧 relayout（避免节点闪跳/抖动）。
    // 被拖节点与其子树由 tick 按指针实时跟手（允许与其它节点重叠），
    // 边由 drawEdges 用实时坐标绘制，保持跟随；释放时在 endDrag 内 relayout 一次渲染正确位置。
    dragPreview = next;
    const parentId = next ? next.parentId : null;
    RT.forEach((r) => r.el.classList.toggle('drop', !!parentId && r.id === parentId));
    const rt = RT.get(d.id);
    if (rt && !rt.el.classList.contains('dragging')) rt.el.classList.add('dragging');
    updateDropLine();
  }

  /* 吸附指示线：兄弟插入显示金线，成为子主题时高亮父级 */
  function updateDropLine() {
    const d = drag;
    if (!dropLine) return;
    if (!d || !d.active || !d.dropTargetId || d.dropZone === 'child') {
      dropLine.classList.remove('on');
      return;
    }
    const rt = RT.get(d.dropTargetId);
    if (!rt || !rt.el) { dropLine.classList.remove('on'); return; }
    // 用布局几何定位吸附线（不受被拖节点的缩放/倾斜影响，避免线随倾斜抖动）
    const sx = view.x + rt.m.x * view.k;
    const sy = view.y + rt.m.y * view.k;
    const w = rt.m.w * view.k;
    const h = rt.m.h * view.k;
    const top = d.dropZone === 'before' ? sy - 3 : sy + h;
    const lineW = Math.max(70, w + 26);
    dropLine.style.left = Math.round(sx + w / 2 - lineW / 2) + 'px';
    dropLine.style.top = Math.round(top) + 'px';
    dropLine.style.width = Math.round(lineW) + 'px';
    dropLine.classList.add('on');
  }

  function endDrag(commit) {
    const d = drag;
    if (!d) return;
    const rt = RT.get(d.id);
    document.body.classList.remove('dragging-node');
    RT.forEach((r) => {
      r.el.classList.remove('drop');
      r.offX = 0;
      r.offY = 0;
    });
    if (dropLine) dropLine.classList.remove('on');

    if (d.active) {
      (d.subtree || []).forEach((sid) => {
        const r = RT.get(sid);
        if (r) r.el.classList.remove('drag-sub');
      });
      if (rt) {
        rt.el.classList.remove('dragging');
        rt.el.style.setProperty('--tilt', '0deg');
      }

      const target = commit && dragPreview ? dragPreview : null;
      dragPreview = null;
      drag = null;

      if (target) {
        const c = doc.nodes[d.id];
        const oldP = doc.nodes[c.parentId];
        const oldIdx = oldP ? oldP.children.indexOf(d.id) : -1;
        if (oldP) oldP.children = oldP.children.filter((x) => x !== d.id);
        const np = doc.nodes[target.parentId];
        if (np) {
          np.children = np.children.filter((x) => x !== d.id);
          const at = clamp(target.index, 0, np.children.length);
          np.children.splice(at, 0, d.id);
          c.parentId = target.parentId;
          np.collapsed = false;
        }
        const changed = oldP !== np || oldIdx !== (np ? np.children.indexOf(d.id) : -1);
        if (changed) { pushHistory(); persist(); }
        relayout();
        if (changed) toast(oldP !== np ? '已移动主题' : '已调整顺序');
      } else {
        relayout();
      }
      return;
    }
    drag = null;
  }

  window.addEventListener('pointermove', (e) => {
    if (drag) {
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > (COARSE ? 9 : 5)) {
          activateDrag();
        } else {
          return;
        }
      }
      if (drag.active) {
        const w = pointerWorld(e.clientX, e.clientY);
        const nx = w.x - drag.offX, ny = w.y - drag.offY;
        const now = performance.now();
        const dt = Math.max(8, now - drag.t);
        drag.vx = drag.vx * 0.65 + ((e.clientX - drag.lastX) / dt * 1000) * 0.35;
        drag.lastX = e.clientX;
        drag.t = now;
        drag.ghostX = nx;
        drag.ghostY = ny;
        const rt = RT.get(drag.id);
        if (rt) {
          rt.cx = nx;
          rt.cy = ny;
          rt.el.style.transform = `translate3d(${nx}px,${ny}px,0)`;
          rt.el.style.setProperty('--tilt', clamp(drag.vx * 0.0055, -3.2, 3.2).toFixed(2) + 'deg');
        }
        updatePreview(e.clientX, e.clientY);
        kick();
      }
      return;
    }
    if (pan) {
      view.x = pan.vx + (e.clientX - pan.sx);
      view.y = pan.vy + (e.clientY - pan.sy);
      userMoved = true;
      applyView();
    }
  });

  window.addEventListener('pointerup', () => {
    if (drag) { endDrag(true); }
    if (pan) {
      pan = null;
      canvas.classList.remove('grabbing');
    }
  });

  window.addEventListener('pointercancel', () => {
    if (drag) endDrag(false);
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.n')) return;
    if (e.button === 0 || e.button === 1) {
      pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      canvas.classList.add('grabbing');
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
      if (e.button === 0) {
        select(null);
        if (editingId) endEdit(editingId);
      }
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * 0.0022);
      zoomAt(f, e.clientX, e.clientY);
    } else {
      view.x -= e.deltaX;
      view.y -= e.deltaY;
      userMoved = true;
      applyView();
    }
  }, { passive: false });

  /* 触摸：双指捏合缩放 */
  let pinch = null;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      pinch = {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2
      };
      pan = null;
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const f = d / Math.max(1, pinch.d);
      if (Math.abs(f - 1) > 0.012) {
        zoomAt(f, pinch.x, pinch.y);
        pinch.d = d;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchend', () => { pinch = null; });

  /* ---------------- 大纲 ---------------- */
  function updateOutline() {
    const list = $('#outlineList');
    if (!list) return;
    const st = list.scrollTop;
    list.textContent = '';
    const walk = (id, depth) => {
      const n = doc.nodes[id];
      if (!n) return;
      const row = document.createElement('div');
      row.className = 'o-row' + (id === selId ? ' on' : '') +
        (n.children.length && !n.collapsed ? ' open' : '');
      row.style.paddingLeft = (2 + depth * 13) + 'px';
      const color = (metas.get(id) && metas.get(id).color) || THEMES[doc.theme].accent;
      row.innerHTML = '<button class="o-chev' + (n.children.length ? '' : ' leaf') + '">' +
        '<i class="ri-arrow-right-s-line"></i></button>' +
        '<span class="o-dot" style="--c:' + color + '"></span><span class="o-label"></span>';
      row.querySelector('.o-label').textContent = n.text || '未命名';
      row.addEventListener('click', (e) => {
        if (e.target.closest('.o-chev')) { toggleCollapse(id); return; }
        select(id);
        centerOn(id);
      });
      list.appendChild(row);
      if (!n.collapsed) n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(doc.rootId, 0);
    list.scrollTop = st;
    const count = $('#nodeCount');
    if (count) count.textContent = Object.keys(doc.nodes).length;
  }

  /* ---------------- 历史 ---------------- */
  function snap() {
    return JSON.stringify({ title: doc.title, theme: doc.theme, layout: doc.layout, rootId: doc.rootId, nodes: doc.nodes });
  }

  function pushHistory() {
    const s = snap();
    if (history[hIndex] === s) return;
    history = history.slice(0, hIndex + 1);
    history.push(s);
    if (history.length > 100) history.shift();
    hIndex = history.length - 1;
  }

  function restore(s) {
    doc = JSON.parse(s);
    document.documentElement.dataset.theme = doc.theme;
    titleEl.textContent = doc.title;
    clearNodes();
    mcache.clear();
    if (!doc.nodes[selId]) selId = doc.rootId;
    relayout();
    buildSwatches();
    buildPalette();
    persist();
  }

  function undo() {
    if (hIndex <= 0) { toast('没有可撤销的操作'); return; }
    hIndex--;
    restore(history[hIndex]);
    toast('已撤销');
  }

  function redo() {
    if (hIndex >= history.length - 1) { toast('没有可重做的操作'); return; }
    hIndex++;
    restore(history[hIndex]);
    toast('已重做');
  }

  /* ---------------- 主题 ---------------- */
  function buildSwatches() {
    const box = $('#themeSeg');
    box.textContent = '';

    // 移动端折叠开关（PC 由 CSS 隐藏，直接不参与布局）
    const trig = document.createElement('button');
    trig.className = 'sw-trigger' + (themeOpen ? ' open' : '');
    trig.title = '主题';
    trig.setAttribute('aria-label', '主题');
    trig.setAttribute('aria-haspopup', 'true');
    trig.setAttribute('aria-expanded', String(themeOpen));
    trig.innerHTML = '<i class="sw-dot" style="background:' +
      THEMES[doc.theme].accent + '"></i><i class="ri-palette-line"></i>';
    trig.addEventListener('click', (e) => {
      e.stopPropagation();
      setThemeOpen(!themeOpen);
    });
    box.appendChild(trig);

    const list = document.createElement('div');
    list.className = 'sw-list';
    box.appendChild(list);

    Object.keys(THEMES).forEach((key) => {
      const b = document.createElement('button');
      b.className = 'sw sw-' + key + (doc.theme === key ? ' on' : '');
      b.title = THEMES[key].label;
      b.setAttribute('aria-label', THEMES[key].label);
      b.setAttribute('aria-pressed', String(doc.theme === key));
      b.addEventListener('click', () => {
        setThemeOpen(false);
        setTheme(key);
      });
      list.appendChild(b);
    });
  }

  /* 主题折叠态：仅移动端生效（PC 上 .sw-list 始终可见） */
  let themeOpen = false;
  function setThemeOpen(on) {
    themeOpen = on;
    document.body.classList.toggle('theme-open', on);
    const trig = document.querySelector('#themeSeg .sw-trigger');
    if (trig) {
      trig.classList.toggle('open', on);
      trig.setAttribute('aria-expanded', String(on));
    }
    // 展开/收起时工具条与色板位置需要重算
    updateToolbar();
  }

  function setTheme(t) {
    if (doc.theme === t) return;
    doc.theme = t;
    document.documentElement.dataset.theme = t;
    mcache.clear();
    buildSwatches();
    buildPalette();
    relayout();
    refreshAll();
    persist();
  }
  function buildPalette() {
    const box = $('#paletteGrid');
    box.textContent = '';
    const pal = THEMES[doc.theme].palette;
    const sel = selId ? doc.nodes[selId] : null;
    pal.forEach((c, i) => {
      const b = document.createElement('button');
      b.style.background = 'linear-gradient(150deg,' + c + ',color-mix(in oklab,' + c + ' 58%, #000))';
      b.title = '主题色 ' + (i + 1);
      if (sel && sel.color === i) b.classList.add('on');
      b.addEventListener('click', () => {
        if (!selId) return;
        doc.nodes[selId].color = i;
        pushHistory();
        relayout();
        persist();
        palette.classList.remove('show');
      });
      box.appendChild(b);
    });
    const reset = $('#paletteReset');
    reset.classList.toggle('on', !!sel && sel.color == null);
  }

  /* ---------------- 持久化 ---------------- */
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) { }
    }, 320);
  }

  /* ---------------- 提示 ---------------- */
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
  }

  /* ---------------- 导出 ---------------- */
  function hex2rgb(h) {
    h = String(h).trim();
    if (h.startsWith('rgb')) {
      const m = h.match(/[\d.]+/g) || [0, 0, 0];
      return [+m[0], +m[1], +m[2]];
    }
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function hexA(h, a) {
    const c = hex2rgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  /* 使用真实 DOM 字体度量换行，保证导出与画布一致 */
  const lineEl = document.createElement('span');
  lineEl.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;white-space:pre;pointer-events:none;';
  document.body.appendChild(lineEl);
  const lwCache = new Map();

  function lineWidth(text, depth) {
    const key = depth + '|' + text;
    const hit = lwCache.get(key);
    if (hit != null) return hit;
    const d = Math.min(depth, 2), s = SIZES[d];
    lineEl.style.fontFamily = getComputedStyle(document.body).fontFamily;
    lineEl.style.fontSize = s.fs + 'px';
    lineEl.style.fontWeight = s.fw;
    lineEl.style.letterSpacing = d === 0 ? '-0.014em' : d === 1 ? '-0.004em' : 'normal';
    lineEl.textContent = text;
    const w = lineEl.getBoundingClientRect().width;
    if (lwCache.size > 2000) lwCache.clear();
    lwCache.set(key, w);
    return w;
  }

  function wrapText(text, depth, maxW) {
    const out = [];
    String(text).split('\n').forEach((para) => {
      if (!para) { out.push(''); return; }
      let line = '';
      for (let i = 0; i < para.length; i++) {
        const ch = para[i];
        const test = line + ch;
        if (line && lineWidth(test, depth) > maxW) {
          const sp = line.lastIndexOf(' ');
          if (sp > 0 && /[A-Za-z0-9]/.test(ch)) {
            out.push(line.slice(0, sp));
            line = line.slice(sp + 1) + ch;
          } else {
            out.push(line);
            line = ch;
          }
        } else {
          line = test;
        }
      }
      out.push(line);
    });
    return out;
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 把整张图绘制到离屏 canvas，供 PNG / xmind 缩略图复用 */
  function buildCanvas(scale, pad) {
    const b = bounds();
    const W = Math.ceil(b.w + pad * 2), H = Math.ceil(b.h + pad * 2);
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * scale);
    cv.height = Math.round(H * scale);
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(-b.x + pad, -b.y + pad);

    const th = THEMES[doc.theme];
    ctx.fillStyle = th.bg;
    ctx.fillRect(b.x - pad, b.y - pad, W, H);
    const g = ctx.createRadialGradient(b.x + b.w * 0.15, b.y - pad, 0, b.x + b.w * 0.15, b.y - pad, Math.max(W, H) * 0.9);
    g.addColorStop(0, hexA(th.accent, doc.theme === 'ivory' ? 0.14 : 0.10));
    g.addColorStop(1, hexA(th.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(b.x - pad, b.y - pad, W, H);

    // 连线
    edges.forEach((ed) => {
      const p = RT.get(ed.pid), c = RT.get(ed.cid);
      if (!p || !c) return;
      const geo = geoFor(p.tx, p.ty, p.m.w, p.m.h, c.tx, c.ty, c.m.w, c.m.h, c.m.side, doc.layout);
      ctx.beginPath();
      ctx.moveTo(geo.x1, geo.y1);
      ctx.bezierCurveTo(geo.c1x, geo.c1y, geo.c2x, geo.c2y, geo.x2, geo.y2);
      ctx.strokeStyle = c.m.color;
      ctx.globalAlpha = c.m.depth === 1 ? 0.72 : 0.5;
      ctx.lineWidth = c.m.depth === 1 ? 2.1 : 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // 节点
    const font = getComputedStyle(document.body).fontFamily;
    RT.forEach((rt) => {
      const m = rt.m, x = rt.tx, y = rt.ty, w = m.w, h = m.h;
      const d = Math.min(m.depth, 2), s = SIZES[d];
      roundRect(ctx, x, y, w, h, d === 0 ? 19 : d === 1 ? 13 : 11);
      if (d === 0) {
        const lg = ctx.createLinearGradient(x, y, x + w, y + h);
        lg.addColorStop(0, mix(m.color, '#ffffff', 0.12));
        lg.addColorStop(1, mix(m.color, '#2A1C0B', 0.3));
        ctx.fillStyle = lg;
        ctx.fill();
        ctx.strokeStyle = hexA(m.color, 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = mix(th.bg, m.color, d === 1 ? 0.11 : 0.06);
        ctx.fill();
        ctx.strokeStyle = mix(th.bg, m.color, d === 1 ? 0.32 : 0.18);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.font = s.fw + ' ' + s.fs + 'px ' + font;
      ctx.fillStyle = d === 0 ? th.goldInk : th.ink;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const lines = wrapText(doc.nodes[m.id].text || '', d, w - s.padX * 2 - 2);
      const lh = s.fs * s.lh;
      let ty = y + (h - lines.length * lh) / 2 + lh / 2;
      lines.forEach((ln) => {
        ctx.fillText(ln, x + s.padX, ty);
        ty += lh;
      });
    });
    return cv;
  }

  function exportPNG() {
    const cv = buildCanvas(2, 90);
    cv.toBlob((blob) => {
      if (!blob) return;
      download(blob, safeName(doc.title) + '.png');
      toast('已导出 PNG · 2×');
    }, 'image/png');
  }

  function exportSVG() {
    const b = bounds();
    const pad = 90;
    const W = Math.ceil(b.w + pad * 2), H = Math.ceil(b.h + pad * 2);
    const th = THEMES[doc.theme];
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const font = getComputedStyle(document.body).fontFamily.replace(/"/g, "'");

    let out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '">';
    out += '<rect width="' + W + '" height="' + H + '" fill="' + th.bg + '"/>';
    out += '<g transform="translate(' + (-b.x + pad) + ',' + (-b.y + pad) + ')">';

    edges.forEach((ed) => {
      const p = RT.get(ed.pid), c = RT.get(ed.cid);
      if (!p || !c) return;
      const g = geoFor(p.tx, p.ty, p.m.w, p.m.h, c.tx, c.ty, c.m.w, c.m.h, c.m.side, doc.layout);
      out += '<path d="M' + g.x1 + ',' + g.y1 + ' C' + g.c1x + ',' + g.c1y + ' ' +
        g.c2x + ',' + g.c2y + ' ' + g.x2 + ',' + g.y2 + '" fill="none" stroke="' + c.m.color +
        '" stroke-width="' + (c.m.depth === 1 ? 2.1 : 1.5) + '" stroke-opacity="' +
        (c.m.depth === 1 ? 0.72 : 0.5) + '" stroke-linecap="round"/>';
    });

    RT.forEach((rt) => {
      const m = rt.m, x = rt.tx, y = rt.ty, w = m.w, h = m.h;
      const d = Math.min(m.depth, 2), s = SIZES[d];
      const r = d === 0 ? 19 : d === 1 ? 13 : 11;
      const fill = d === 0 ? mix(m.color, '#ffffff', 0.06) : mix(th.bg, m.color, d === 1 ? 0.11 : 0.06);
      const stroke = d === 0 ? hexA(m.color, 0.55) : mix(th.bg, m.color, d === 1 ? 0.32 : 0.18);
      out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r +
        '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"/>';
      const lines = wrapText(doc.nodes[m.id].text || '', d, w - s.padX * 2 - 2);
      const lh = s.fs * s.lh;
      const startY = y + (h - lines.length * lh) / 2 + lh / 2;
      out += '<text font-family="' + font + '" font-size="' + s.fs + '" font-weight="' + s.fw +
        '" fill="' + (d === 0 ? th.goldInk : th.ink) + '" dominant-baseline="middle">';
      lines.forEach((ln, i) => {
        out += '<tspan x="' + (x + s.padX) + '" y="' + (startY + i * lh) + '">' + esc(ln) + '</tspan>';
      });
      out += '</text>';
    });

    out += '</g></svg>';
    download(new Blob([out], { type: 'image/svg+xml' }), safeName(doc.title) + '.svg');
    toast('已导出 SVG');
  }

  function safeName(s) {
    return String(s || 'mindmap').replace(/[\\/:*?"<>|]/g, '-').slice(0, 40);
  }

  function download(blob, name) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------------- ZMind 原生格式 ----------------
     .zmind 是带「专属文件头」的二进制容器，而非裸 JSON：
       [0..4)   magic       "ZMND" (4 bytes)
       [4]      version     uint8   (当前 1)
       [5]      flags       uint8   (预留)
       [6..10)  payloadLen  uint32 LE
       [10..10+N)        payload   UTF-8 JSON（文档/视图/统计）
       [10+N..10+N+4)    crc32     uint32 LE（对 payload 计算）
     解析由专用 parseZmind() 完成（DataView + TextDecoder + CRC 校验），
     不直接对原始文件做 JSON.parse，从而具备专属格式识别与完整性校验。
  ------------------------------------------------- */
  const ZMIND_MAGIC = [0x5A, 0x4D, 0x4E, 0x44]; // "ZMND"
  const ZMIND_VERSION = 1;
  // 复用下方 XMind 写入器提供的 CRC_TABLE / crc32 做完整性校验

  function buildZmind() {
    return {
      format: 'zmind',
      version: ZMIND_VERSION,
      app: 'ZMind',
      savedAt: new Date().toISOString(),
      doc: JSON.parse(JSON.stringify(doc)),
      view: { x: Math.round(view.x), y: Math.round(view.y), k: Math.round(view.k * 1000) / 1000 },
      stats: {
        topics: Object.keys(doc.nodes).length,
        maxDepth: Math.max(...Array.from(metas.values()).map((m) => m.depth), 0)
      }
    };
  }

  /* 专用写入：构造二进制 .zmind 容器 */
  function writeZmind(obj) {
    const enc = new TextEncoder();
    const payload = enc.encode(JSON.stringify(obj));
    const buf = new ArrayBuffer(10 + payload.length + 4);
    const dv = new DataView(buf);
    ZMIND_MAGIC.forEach((b, i) => dv.setUint8(i, b));
    dv.setUint8(4, ZMIND_VERSION);
    dv.setUint8(5, 0);
    dv.setUint32(6, payload.length, true);
    new Uint8Array(buf).set(payload, 10);
    dv.setUint32(10 + payload.length, crc32(payload), true);
    return new Blob([buf], { type: 'application/octet-stream' });
  }

  /* 专用解析：从二进制容器还原对象（不直接对文件本体 JSON.parse） */
  function parseZmind(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 14) throw new Error('文件过小，不是有效的 .zmind');
    const dv = new DataView(buffer);
    let magicOk = true;
    for (let i = 0; i < 4; i++) {
      if (bytes[i] !== ZMIND_MAGIC[i]) { magicOk = false; break; }
    }
    if (!magicOk) {
      // 兼容早期「裸 JSON」版 .zmind：退回文本解析（仅作兼容，新文件走二进制通道）
      try {
        const txt = new TextDecoder().decode(bytes).trim();
        if (txt[0] !== '{') throw new Error('文件头无效，不是 .zmind 格式');
        return JSON.parse(txt);
      } catch (e) {
        throw new Error('文件头无效，不是 .zmind 格式');
      }
    }
    const version = dv.getUint8(4);
    if (version > ZMIND_VERSION) throw new Error('文件版本过高，请升级 ZMind');
    const len = dv.getUint32(6, true);
    if (len <= 0 || 10 + len + 4 > bytes.length) throw new Error('长度字段异常');
    const payload = bytes.subarray(10, 10 + len);
    const want = dv.getUint32(10 + len, true);
    const got = crc32(payload);
    if (got !== want) throw new Error('校验失败，文件可能已损坏');
    const txt = new TextDecoder().decode(payload);
    return JSON.parse(txt);
  }

  function exportZmind() {
    const blob = writeZmind(buildZmind());
    download(blob, safeName(doc.title) + '.zmind');
    toast('已保存 .zmind · 全部信息');
  }

  /* 统一应用 .zmind / JSON 载荷：兼容「容器格式」和「裸文档」两种形态 */
  function applyZmindPayload(data, okMsg) {
    const d = (data && data.doc && data.doc.nodes) ? data.doc
      : (data && data.nodes && data.rootId ? data : null);
    if (!d || !d.rootId || !d.nodes || !d.nodes[d.rootId]) {
      throw new Error('内容缺失或不是 ZMind 文档');
    }
    loadDoc(d, okMsg || '已导入');
    // 恢复保存时的视图（先取消 fit 动画，否则会被它覆盖）
    if (data.view && typeof data.view.k === 'number') {
      viewAnim++;
      view = {
        x: clamp(data.view.x || 0, -1e6, 1e6),
        y: clamp(data.view.y || 0, -1e6, 1e6),
        k: clamp(data.view.k, 0.2, 2.8)
      };
      userMoved = true;
      applyView();
    }
  }

  function importZmind(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = parseZmind(fr.result);
        const n = data && data.stats ? data.stats.topics
          : (data && data.doc ? Object.keys(data.doc.nodes || {}).length : null);
        applyZmindPayload(data, '已导入 .zmind' + (n ? ' · ' + n + ' 个主题' : ''));
      } catch (err) {
        toast(err && err.message ? ('.zmind ' + err.message) : '.zmind 文件解析失败');
      }
    };
    fr.readAsArrayBuffer(file);
  }

  function exportJSON() {
    download(new Blob([JSON.stringify(buildZmind(), null, 2)], { type: 'application/json' }), safeName(doc.title) + '.json');
    toast('已保存 JSON');
  }

  /* 应用一份文档状态（不动历史） */
  function applyDocState(next) {
    swapping = true;
    try {
      doc = next;
      if (!THEMES[doc.theme]) doc.theme = 'obsidian';
      if (!['right', 'balanced', 'down'].includes(doc.layout)) doc.layout = 'balanced';
      // 旧存档里的自定义色字段不再支持，一并剔除
      delete doc.themeCustom;
      document.documentElement.dataset.theme = doc.theme;
      clearLegacyThemeVars();
      titleEl.textContent = doc.title || '未命名导图';
      clearNodes();
      mcache.clear();
      lwCache.clear();
      selId = doc.rootId;
      buildSwatches();
      buildPalette();
      updateSeg();
      // 重建布局（绕过 swapping 守卫：这里是唯一合法的重建点）
      computeLayout();
      render();
      kick();
      fit(true);
      persist();
    } finally {
      swapping = false;   // 任何异常都不能让守卫卡死，否则后续渲染全部失效
    }
  }

  /* 载入一份新文档（导入用，重置历史） */
  function loadDoc(next, msg) {
    applyDocState(next);
    history = [snap()];
    hIndex = 0;
    toast(msg || '已导入');
  }

  function blankDoc() {
    return {
      title: '未命名导图',
      theme: doc ? doc.theme : 'obsidian',
      layout: 'balanced',
      rootId: 'r',
      nodes: {
        r: { id: 'r', text: '中心主题', parentId: null, children: [], collapsed: false, color: null }
      }
    };
  }

  /* 新建：保留历史，可撤销 */
  function newDoc(kind) {
    if (presenting) endPres();
    const next = kind === 'sample' ? sampleDoc() : blankDoc();
    next.theme = doc ? doc.theme : 'obsidian';
    pushHistory();
    applyDocState(next);
    pushHistory();
    if (kind === 'sample') {
      toast('已载入示例导图');
    } else {
      select(doc.rootId);
      startEdit(doc.rootId);
      toast('已新建空白导图');
    }
  }

  function importJSON(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(String(fr.result));
        if (!data || !data.nodes || !data.nodes[data.rootId]) throw new Error('bad');
        loadDoc(data, '已导入 JSON');
      } catch (err) {
        toast('JSON 文件格式不正确');
      }
    };
    fr.readAsText(file);
  }

  /* ============================================================
     XMind 导入 / 导出
     .xmind = zip 包，内含 content.json（XMind Zen/2020+）
     或 content.xml（XMind 8）
     ============================================================ */
  const STRUCT_OUT = {
    balanced: 'org.xmind.ui.map.unbalanced',
    right: 'org.xmind.ui.logic.right',
    down: 'org.xmind.ui.org-chart.down'
  };

  /* ---- CRC32 ---- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  async function deflateRaw(bytes) {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* ---- 极简 ZIP 写入 ---- */
  async function zipFiles(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const canDeflate = typeof CompressionStream !== 'undefined';

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const raw = f.data;
      let comp = raw, method = 0;
      if (canDeflate && raw.length > 48) {
        try {
          const d = await deflateRaw(raw);
          if (d.length < raw.length) { comp = d; method = 8; }
        } catch (e) { }
      }
      const crc = crc32(raw);

      const lh = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, method, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, comp.length, true);
      dv.setUint32(22, raw.length, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);
      chunks.push(lh, comp);

      const cd = new Uint8Array(46 + nameBytes.length);
      const dv2 = new DataView(cd.buffer);
      dv2.setUint32(0, 0x02014b50, true);
      dv2.setUint16(4, 20, true);
      dv2.setUint16(6, 20, true);
      dv2.setUint16(8, 0, true);
      dv2.setUint16(10, method, true);
      dv2.setUint16(12, 0, true);
      dv2.setUint16(14, 0x21, true);
      dv2.setUint32(16, crc, true);
      dv2.setUint32(20, comp.length, true);
      dv2.setUint32(24, raw.length, true);
      dv2.setUint16(28, nameBytes.length, true);
      dv2.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += lh.length + comp.length;
    }

    const cdStart = offset;
    let cdSize = 0;
    central.forEach((c) => { chunks.push(c); cdSize += c.length; });

    const eocd = new Uint8Array(22);
    const dv3 = new DataView(eocd.buffer);
    dv3.setUint32(0, 0x06054b50, true);
    dv3.setUint16(8, files.length, true);
    dv3.setUint16(10, files.length, true);
    dv3.setUint32(12, cdSize, true);
    dv3.setUint32(16, cdStart, true);
    chunks.push(eocd);

    return new Blob(chunks, { type: 'application/zip' });
  }

  /* ---- 极简 ZIP 读取 ---- */
  async function unzip(buffer) {
    const u8 = new Uint8Array(buffer);
    const dv = new DataView(u8.buffer);
    let eocd = -1;
    const min = Math.max(0, u8.length - 22 - 65535);
    for (let i = u8.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的压缩包');

    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {};

    for (let i = 0; i < count; i++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));

      const lnlen = dv.getUint16(lho + 26, true);
      const lelen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lelen;
      const comp = u8.subarray(start, start + csize);

      let data = null;
      if (method === 0) data = comp;
      else if (method === 8) {
        try { data = await inflateRaw(comp); } catch (e) { data = null; }
      }
      if (data) out[name] = data;
      p += 46 + nlen + elen + clen;
    }
    return out;
  }

  /* ---- 结构映射 ---- */
  function topicFromNode(id) {
    const n = doc.nodes[id];
    if (!n) return null;
    const t = { id: 'zmind-' + n.id, class: 'topic', title: n.text || '主题' };
    if (n.collapsed && n.children.length) t.branch = 'folded';
    if (n.children.length) {
      const kids = n.children.map(topicFromNode).filter(Boolean);
      if (kids.length) t.children = { attached: kids };
    }
    return t;
  }

  function layoutFromStructure(sc) {
    const s = String(sc || '');
    if (/org-chart|tree\.down|logic\.down/i.test(s)) return 'down';
    if (/logic\.right|tree\.right|org-chart\.right/i.test(s)) return 'right';
    if (/map|unbalanced|fishbone|timeline/i.test(s)) return 'balanced';
    return 'balanced';
  }

  function treeFromJsonTopic(t) {
    if (!t) return null;
    const kids = (t.children && t.children.attached) || [];
    return {
      title: t.title || '',
      folded: t.branch === 'folded',
      children: kids.map(treeFromJsonTopic).filter(Boolean)
    };
  }

  function parseXmind8(xmlText) {
    const d = new DOMParser().parseFromString(xmlText, 'application/xml');
    const sheet = d.getElementsByTagName('sheet')[0];
    if (!sheet) throw new Error('no sheet');
    const rootEl = Array.prototype.slice.call(sheet.children)
      .filter((e) => e.localName === 'topic')[0];
    if (!rootEl) throw new Error('no root topic');
    const conv = (el) => {
      const kids = [];
      const titleEl = Array.prototype.slice.call(el.children).filter((e) => e.localName === 'title')[0];
      const chEl = Array.prototype.slice.call(el.children).filter((e) => e.localName === 'children')[0];
      if (chEl) {
        Array.prototype.slice.call(chEl.children)
          .filter((e) => e.localName === 'topics' && e.getAttribute('type') === 'attached')
          .forEach((tp) => {
            Array.prototype.slice.call(tp.children)
              .filter((e) => e.localName === 'topic')
              .forEach((k) => kids.push(conv(k)));
          });
      }
      const folded = el.getAttribute('branch') === 'folded';
      return { title: titleEl ? titleEl.textContent : '', folded, children: kids };
    };
    const titleEl = Array.prototype.slice.call(sheet.children).filter((e) => e.localName === 'title')[0];
    return {
      sheetTitle: titleEl ? titleEl.textContent : '',
      root: conv(rootEl),
      structure: rootEl.getAttribute('structure-class') || ''
    };
  }

  function docFromTree(tree, title, structure) {
    const nodes = {};
    let i = 0;
    const CAP = 1200;
    const walk = (t, parentId) => {
      if (!t || i >= CAP) return null;
      const id = 'n' + (++i);
      nodes[id] = {
        id,
        text: String(t.title || '主题').slice(0, 300),
        parentId: parentId || null,
        children: [],
        collapsed: !!t.folded,
        color: null
      };
      if (parentId) nodes[parentId].children.push(id);
      (t.children || []).forEach((k) => walk(k, id));
      return id;
    };
    const rootId = walk(tree, null);
    if (!rootId) throw new Error('empty');
    return {
      title: String(title || '导入的导图').replace(/\.xmind$/i, '').slice(0, 60),
      theme: doc ? doc.theme : 'obsidian',
      layout: layoutFromStructure(structure),
      rootId,
      nodes
    };
  }

  function xmlEsc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  /* 同时生成 XMind 8 的 content.xml，保证旧版也能打开 */
  function buildXmind8Content(rootTopic, sheetTitle, structureClass) {
    const ts = Date.now();
    const topicXml = (t) => {
      const kids = (t.children && t.children.attached) || [];
      let s = '<topic id="' + t.id + '"' +
        (t.branch === 'folded' ? ' branch="folded"' : '') +
        ' structure-class="' + structureClass + '" timestamp="' + ts + '">';
      s += '<title>' + xmlEsc(t.title) + '</title>';
      if (kids.length) {
        s += '<children><topics type="attached">' + kids.map(topicXml).join('') + '</topics></children>';
      }
      return s + '</topic>';
    };
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
      '<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" version="2.0">' +
      '<sheet id="zmind-sheet-xml" timestamp="' + ts + '">' +
      topicXml(rootTopic) +
      '<title>' + xmlEsc(sheetTitle) + '</title>' +
      '</sheet></xmap-content>';
  }

  async function exportXmind() {
    const sheetId = 'zmind-sheet-' + Date.now().toString(36);
    const rootTopic = topicFromNode(doc.rootId);
    if (!rootTopic) return;
    const structureClass = STRUCT_OUT[doc.layout] || STRUCT_OUT.balanced;
    rootTopic.structureClass = structureClass;
    const sheetTitle = doc.title || '画布 1';

    const content = [{
      id: sheetId,
      class: 'sheet',
      title: sheetTitle,
      rootTopic,
      topicPositioning: 'fixed'
    }];
    const metadata = {
      creator: { name: 'ZMind', version: '1.0.0' },
      activeSheetId: sheetId,
      dataStructureVersion: '2',
      layoutEngineVersion: '3'
    };

    const enc = new TextEncoder();
    const files = [
      { name: 'content.json', data: enc.encode(JSON.stringify(content)) },
      { name: 'metadata.json', data: enc.encode(JSON.stringify(metadata)) },
      { name: 'content.xml', data: enc.encode(buildXmind8Content(rootTopic, sheetTitle, structureClass)) },
      { name: 'meta.xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<meta xmlns="urn:xmind:xmap:xmlns:meta:2.0" version="2.0"/>') },
      { name: 'styles.xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<xmap-styles xmlns="urn:xmind:xmap:xmlns:style:2.0" version="2.0"/>') },
      {
        name: 'META-INF/manifest.xml',
        data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
          '<manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0">' +
          '<file-entry full-path="content.xml" media-type="text/xml"/>' +
          '<file-entry full-path="META-INF/" media-type=""/>' +
          '<file-entry full-path="META-INF/manifest.xml" media-type="text/xml"/>' +
          '<file-entry full-path="meta.xml" media-type="text/xml"/>' +
          '<file-entry full-path="styles.xml" media-type="text/xml"/>' +
          '</manifest>')
      }
    ];

    // 附带缩略图，方便 XMind 文件列表预览
    try {
      const b = bounds();
      const scale = Math.min(1, 360 / Math.max(b.w + 120, 1));
      const cv = buildCanvas(scale, 50);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      if (blob) {
        files.push({ name: 'Thumbnails/thumbnail.png', data: new Uint8Array(await blob.arrayBuffer()) });
      }
    } catch (e) { }

    const entries = {};
    files.forEach((f) => { entries[f.name] = {}; });
    files.push({ name: 'manifest.json', data: enc.encode(JSON.stringify({ 'file-entries': entries })) });

    try {
      const blob = await zipFiles(files);
      download(blob, safeName(doc.title) + '.xmind');
      toast('已导出 .xmind');
    } catch (e) {
      toast('导出失败，请重试');
    }
  }

  async function importXmind(file) {
    try {
      const files = await unzip(await file.arrayBuffer());
      const dec = new TextDecoder();

      if (files['content.json']) {
        const arr = JSON.parse(dec.decode(files['content.json']));
        const sheet = Array.isArray(arr) ? arr[0] : (arr.sheets ? arr.sheets[0] : arr);
        if (!sheet) throw new Error('no sheet');
        const root = sheet.rootTopic || sheet.root;
        const sc = (root && root.structureClass) || sheet.structureClass || '';
        const tree = treeFromJsonTopic(root);
        if (!tree) throw new Error('no root');
        loadDoc(docFromTree(tree, sheet.title || file.name, sc), '已导入 XMind');
        return;
      }

      if (files['content.xml']) {
        const parsed = parseXmind8(dec.decode(files['content.xml']));
        loadDoc(docFromTree(parsed.root, parsed.sheetTitle || file.name, parsed.structure), '已导入 XMind 8');
        return;
      }

      toast('文件里没有找到 XMind 内容');
    } catch (e) {
      toast('XMind 文件解析失败');
    }
  }

  function importFile(file) {
    if (!file) return;
    if (/\.zmind$/i.test(file.name)) importZmind(file);
    else if (/\.xmind$/i.test(file.name)) importXmind(file);
    else importJSON(file);
  }

  /* ---------------- 清空视图 ---------------- */
  function clearNodes() {
    world.querySelectorAll('.n').forEach((el) => el.remove());
    RT.clear();
    edges = [];
    edgeLayer.textContent = '';
    structSig = '__init__';
  }

  /* ---------------- 键盘 ---------------- */
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

    const meta = e.metaKey || e.ctrlKey;

    if (presenting) {
      if (e.key === 'Escape') { e.preventDefault(); endPres(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' ||
          e.key === 'PageDown' || e.key === 'Enter') {
        e.preventDefault(); presGo(presIdx + 1); return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault(); presGo(presIdx - 1); return;
      }
      if (e.key === 'Home') { e.preventDefault(); presGo(0); return; }
      if (e.key === 'End') { e.preventDefault(); presGo(presList.length - 1); return; }
      return;
    }

    if (e.code === 'Space' && !spaceDown) {
      spaceDown = true;
      canvas.style.cursor = 'grab';
      e.preventDefault();
      return;
    }
    if (meta && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (meta && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleOutline();
      return;
    }
    if (!meta && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      setMinimap(!mmOn);
      return;
    }
    if (!meta && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      startPres();
      return;
    }
    if (meta && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      toggleNewMenu();
      return;
    }
    if (meta && (e.key === '0' || e.key === ')')) {
      e.preventDefault();
      fit(true);
      return;
    }
    if (meta && e.key.toLowerCase() === 's') {
      e.preventDefault();
      exportZmind();
      return;
    }
    if (e.key === 'Escape') {
      if (drag && drag.active) { e.preventDefault(); endDrag(false); return; }
      if (menu.classList.contains('show')) { menu.classList.remove('show'); return; }
      if ($('#newMenu').classList.contains('show')) { $('#newMenu').classList.remove('show'); return; }
      if (seqPanel.classList.contains('open')) { toggleSeq(false); return; }
      if ($('#moreMenu').classList.contains('show')) { $('#moreMenu').classList.remove('show'); return; }
      if (themeOpen) { setThemeOpen(false); return; }
      if ($('#help').classList.contains('show')) { $('#help').classList.remove('show'); return; }
      select(null);
      return;
    }
    if (!selId) {
      if (e.key === 'Tab') { e.preventDefault(); select(doc.rootId); }
      return;
    }

    if (e.key === 'Tab') { e.preventDefault(); addChild(selId); return; }
    if (e.key === 'Enter') { e.preventDefault(); addSibling(selId); return; }
    if (e.key === 'F2' || e.key === '/') { e.preventDefault(); startEdit(selId); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (selId && selId !== doc.rootId) deleteNode(selId); return; }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const n = doc.nodes[selId];
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (!n.parentId) return;
        const sibs = doc.nodes[n.parentId].children;
        const i = sibs.indexOf(selId);
        const ni = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, sibs.length - 1);
        if (sibs[ni]) { select(sibs[ni]); ensureVisible(sibs[ni]); }
      } else if (e.key === 'ArrowLeft') {
        if (n.parentId) { select(n.parentId); ensureVisible(n.parentId); }
      } else {
        if (n.children.length) {
          if (n.collapsed) { n.collapsed = false; relayout(); persist(); }
          const c = n.children[0];
          select(c);
          ensureVisible(c);
        }
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      canvas.style.cursor = '';
    }
  });

  /* ---------------- 绑定 ---------------- */
  function updateSeg() {
    document.querySelectorAll('#layoutSeg button').forEach((b) => {
      b.classList.toggle('on', b.dataset.layout === doc.layout);
    });
  }

  function toggleOutline() {
    const open = !outline.classList.contains('open');
    outline.classList.toggle('open', open);
    document.body.classList.toggle('outline-open', open);
    $('#outlineBtn').classList.toggle('on', open);
    if (open) toggleSeq(false);
    refreshAll();
  }

  /* 全量刷新：修掉任何残留的位移 / 偏移 / 连线状态 */
  function refreshAll() {
    relayout();
    drawEdges();
    updateOutline();
    applyView();
  }

  function toggleNewMenu() {
    const m = $('#newMenu');
    if (m.classList.contains('show')) { m.classList.remove('show'); return; }
    menu.classList.remove('show');
    const r = $('#newBtn').getBoundingClientRect();
    const w = m.offsetWidth || 196;
    m.style.right = 'auto';
    m.style.left = Math.max(12, Math.min(r.left - 16, window.innerWidth - w - 12)) + 'px';
    m.style.top = (r.bottom + 10) + 'px';
    m.classList.add('show');
  }

  function bind() {
    $('#layoutSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      doc.layout = b.dataset.layout;
      updateSeg();
      relayout();
      fit(true);
      refreshAll();
      persist();
    });

    titleEl.addEventListener('input', () => {
      doc.title = (titleEl.innerText || '').trim() || '未命名导图';
      persist();
    });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    });

    toolbar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !selId) return;
      const cur = selId;
      const act = b.dataset.act;
      if (act === 'child') addChild(cur);
      else if (act === 'sibling') addSibling(cur);
      else if (act === 'collapse') toggleCollapse(cur);
      else if (act === 'delete') deleteNode(cur);
      else if (act === 'color') {
        buildPalette();
        palette.classList.toggle('show');
        updateToolbar();
      }
    });

    $('#paletteReset').addEventListener('click', () => {
      if (!selId) return;
      doc.nodes[selId].color = null;
      pushHistory();
      relayout();
      persist();
      palette.classList.remove('show');
    });

    $('#zoomIn').addEventListener('click', () => {
      zoomAt(1.2, canvas.clientWidth / 2, canvas.clientHeight / 2);
    });
    $('#zoomOut').addEventListener('click', () => {
      zoomAt(1 / 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2);
    });
    zoomLabel.addEventListener('click', () => set100(true));
    $('#fitBtn').addEventListener('click', () => fit(true));

    $('#outlineBtn').addEventListener('click', toggleOutline);
    $('#expandAll').addEventListener('click', () => {
      Object.values(doc.nodes).forEach((n) => { n.collapsed = false; });
      pushHistory(); relayout(); persist();
    });
    $('#collapseAll').addEventListener('click', () => {
      Object.values(doc.nodes).forEach((n) => {
        n.collapsed = n.id !== doc.rootId && n.children.length > 0;
      });
      pushHistory(); relayout(); persist();
    });

    $('#newBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNewMenu();
    });
    $('#newMenu').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $('#newMenu').classList.remove('show');
      if (b.dataset.new === 'import') { $('#fileInput').click(); return; }
      newDoc(b.dataset.new);
    });

    $('#playBtn').addEventListener('click', startPres);
    $('#moreBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const m = $('#moreMenu');
      const show = !m.classList.contains('show');
      menu.classList.remove('show');
      $('#newMenu').classList.remove('show');
      if (show) {
        const r = $('#moreBtn').getBoundingClientRect();
        m.style.right = 'auto';
        m.style.left = Math.max(12, Math.min(r.left - 20, window.innerWidth - m.offsetWidth - 12)) + 'px';
        m.style.top = (r.bottom + 10) + 'px';
      }
      m.classList.toggle('show', show);
    });
    $('#moreMenu').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $('#moreMenu').classList.remove('show');
      const k = b.dataset.more;
      if (k === 'play') startPres();
      else if (k === 'outline') toggleOutline();
      else if (k === 'order') toggleSeq();
      else if (k === 'minimap') setMinimap(!mmOn);
      else if (k === 'fit') fit(true);
      else if (k === 'help') $('#help').classList.add('show');
      else if (k === 'export') {
        const r = $('#moreBtn').getBoundingClientRect();
        menu.style.right = 'auto';
        menu.style.left = Math.max(12, Math.min(r.left - 20, window.innerWidth - menu.offsetWidth - 12)) + 'px';
        menu.style.top = (r.bottom + 10) + 'px';
        menu.classList.toggle('show');
      }
    });
    $('#orderBtn').addEventListener('click', () => toggleSeq());
    $('#outlineClose').addEventListener('click', () => toggleOutline());
    $('#seqClose').addEventListener('click', () => toggleSeq(false));
    $('#seqReset').addEventListener('click', () => {
      doc.order = null;
      pushHistory(); persist(); renderSeq();
      toast('已恢复自动顺序');
    });
    $('#presPrev').addEventListener('click', () => presGo(presIdx - 1));
    $('#presNext').addEventListener('click', () => presGo(presIdx + 1));
    $('#presExit').addEventListener('click', endPres);

    $('#exportBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('#newMenu').classList.remove('show');
      menu.style.left = ''; menu.style.top = ''; menu.style.right = '';
      menu.classList.toggle('show');
    });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const k = b.dataset.export;
      menu.classList.remove('show');
      if (k === 'zmind') exportZmind();
      else if (k === 'png') exportPNG();
      else if (k === 'svg') exportSVG();
      else if (k === 'xmind') exportXmind();
      else if (k === 'json') exportJSON();
    });
    $('#fileInput').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importFile(f);
      e.target.value = '';
    });

    // 缩略图开关
    $('#mmBtn').addEventListener('click', () => setMinimap(!mmOn));

    // 拖入文件导入
    ['dragenter', 'dragover'].forEach((ev) => {
      canvas.addEventListener(ev, (e) => {
        e.preventDefault();
        canvas.classList.add('dropping');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      canvas.addEventListener(ev, (e) => {
        e.preventDefault();
        if (ev === 'dragleave' && e.relatedTarget) return;
        canvas.classList.remove('dropping');
      });
    });
    canvas.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /\.(zmind|xmind|json)$/i.test(f.name)) importFile(f);
    });

    $('#helpBtn').addEventListener('click', () => $('#help').classList.add('show'));
    $('#helpClose').addEventListener('click', () => $('#help').classList.remove('show'));
    $('#help').addEventListener('click', (e) => {
      if (e.target.id === 'help') $('#help').classList.remove('show');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#menu') && !e.target.closest('#exportBtn')) menu.classList.remove('show');
      if (!e.target.closest('#newMenu') && !e.target.closest('#newBtn')) $('#newMenu').classList.remove('show');
      if (!e.target.closest('#moreMenu') && !e.target.closest('#moreBtn')) $('#moreMenu').classList.remove('show');
      if (!e.target.closest('#palette') && !e.target.closest('[data-act="color"]')) {
        if (!e.target.closest('#toolbar')) palette.classList.remove('show');
      }
      if (!e.target.closest('#themeSeg')) setThemeOpen(false);
    });

    window.addEventListener('resize', () => {
      updateToolbar();
      measureMM();
      drawMinimap();
    });
  }

  /* ============================================================
     缩略图：可直接拖拽 / 点击调整视图
     ============================================================ */
  const minimap = $('#minimap');
  const mmCanvas = $('#mmCanvas');
  const mmCtx = mmCanvas.getContext('2d');
  let mmOn = true;
  let mmT = { ox: 0, oy: 0, k: 1 };
  let mmDrag = null;
  let mmW = 0, mmH = 0;

  function measureMM() {
    mmW = mmCanvas.clientWidth;
    mmH = mmCanvas.clientHeight;
  }

  function drawMinimap() {
    if (!mmOn || !mmW || !mmH || presenting) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mmCanvas.width !== Math.round(mmW * dpr) || mmCanvas.height !== Math.round(mmH * dpr)) {
      mmCanvas.width = Math.round(mmW * dpr);
      mmCanvas.height = Math.round(mmH * dpr);
    }
    const ctx = mmCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, mmW, mmH);
    if (!metas.size) return;

    const b = bounds();
    const vw = canvas.clientWidth / view.k;
    const vh = canvas.clientHeight / view.k;
    const vx = -view.x / view.k;
    const vy = -view.y / view.k;
    const pad = 10;
    const bw = Math.max(1, b.w), bh = Math.max(1, b.h);
    const k = Math.min((mmW - pad * 2) / bw, (mmH - pad * 2) / bh);
    const ox = (mmW - bw * k) / 2 - b.x * k;
    const oy = (mmH - bh * k) / 2 - b.y * k;
    mmT = { ox, oy, k };
    const X = (v) => ox + v * k;
    const Y = (v) => oy + v * k;
    const th = THEMES[doc.theme];

    // 底色，让缩略图与玻璃面板分层
    ctx.fillStyle = hexA(th.bg, doc.theme === 'ivory' ? 0.5 : 0.45);
    roundRect(ctx, 0, 0, mmW, mmH, 9);
    ctx.fill();

    ctx.save();
    roundRect(ctx, 0, 0, mmW, mmH, 9);
    ctx.clip();

    // 连线
    ctx.lineWidth = 0.8;
    edges.forEach((ed) => {
      const p = RT.get(ed.pid), c = RT.get(ed.cid);
      if (!p || !c) return;
      const g = geoFor(p.tx, p.ty, p.m.w, p.m.h, c.tx, c.ty, c.m.w, c.m.h, c.m.side, doc.layout);
      ctx.beginPath();
      ctx.moveTo(X(g.x1), Y(g.y1));
      ctx.bezierCurveTo(X(g.c1x), Y(g.c1y), X(g.c2x), Y(g.c2y), X(g.x2), Y(g.y2));
      ctx.strokeStyle = hexA(c.m.color, 0.5);
      ctx.stroke();
    });

    // 节点
    RT.forEach((rt) => {
      const m = rt.m;
      const x = X(rt.tx), y = Y(rt.ty);
      const w = Math.max(2, m.w * k), h = Math.max(2, m.h * k);
      ctx.fillStyle = hexA(m.color, m.depth === 0 ? 0.95 : m.depth === 1 ? 0.72 : 0.45);
      roundRect(ctx, x, y, w, h, Math.min(2.5, h / 2));
      ctx.fill();
    });

    // 视口框（超出面板时裁切到边缘）
    const rx0 = clamp(X(vx), 1, mmW - 6);
    const ry0 = clamp(Y(vy), 1, mmH - 6);
    const rx1 = clamp(X(vx + vw), 6, mmW - 1);
    const ry1 = clamp(Y(vy + vh), 6, mmH - 1);
    const rw = Math.max(6, rx1 - rx0), rh = Math.max(6, ry1 - ry0);
    const coversAll = vx <= b.x && vy <= b.y && vx + vw >= b.x + b.w && vy + vh >= b.y + b.h;
    ctx.fillStyle = hexA(th.accent, coversAll ? 0.035 : 0.07);
    roundRect(ctx, rx0, ry0, rw, rh, 4);
    ctx.fill();
    ctx.strokeStyle = hexA(th.accent, coversAll ? 0.38 : 0.85);
    ctx.lineWidth = 1.2;
    roundRect(ctx, rx0 + 0.6, ry0 + 0.6, Math.max(3, rw - 1.2), Math.max(3, rh - 1.2), 3.4);
    ctx.stroke();
    ctx.restore();
  }

  function mmToWorld(px, py) {
    return { x: (px - mmT.ox) / mmT.k, y: (py - mmT.oy) / mmT.k };
  }

  function mmCenterTo(cx, cy) {
    view.x = canvas.clientWidth / 2 - cx * view.k;
    view.y = canvas.clientHeight / 2 - cy * view.k;
    userMoved = true;
    applyView();
  }

  mmCanvas.addEventListener('pointerdown', (e) => {
    if (!mmT.k) return;
    e.preventDefault();
    e.stopPropagation();
    const r = mmCanvas.getBoundingClientRect();
    const w = mmToWorld(e.clientX - r.left, e.clientY - r.top);
    const cx = (canvas.clientWidth / 2 - view.x) / view.k;
    const cy = (canvas.clientHeight / 2 - view.y) / view.k;
    mmDrag = { dx: w.x - cx, dy: w.y - cy };
    try { mmCanvas.setPointerCapture(e.pointerId); } catch (err) { }
    minimap.classList.add('dragging');
    mmCenterTo(w.x - mmDrag.dx, w.y - mmDrag.dy);
  });

  mmCanvas.addEventListener('pointermove', (e) => {
    if (!mmDrag) return;
    const r = mmCanvas.getBoundingClientRect();
    const w = mmToWorld(e.clientX - r.left, e.clientY - r.top);
    mmCenterTo(w.x - mmDrag.dx, w.y - mmDrag.dy);
  });

  function mmEndDrag() {
    if (!mmDrag) return;
    mmDrag = null;
    minimap.classList.remove('dragging');
  }
  window.addEventListener('pointerup', mmEndDrag);
  window.addEventListener('pointercancel', mmEndDrag);

  mmCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, canvas.clientWidth / 2, canvas.clientHeight / 2);
  }, { passive: false });

  function setMinimap(on, silent) {
    mmOn = on;
    minimap.classList.toggle('hide', !on);
    const btn = $('#mmBtn');
    if (btn) btn.classList.toggle('on', on);
    try { localStorage.setItem('zmind.mm', on ? '1' : '0'); } catch (e) { }
    if (on) requestAnimationFrame(() => { measureMM(); drawMinimap(); });
    if (!silent) toast(on ? '缩略图已开启' : '缩略图已关闭');
  }

  /* ============================================================
     演示模式：镜头在主题间巡游
     ============================================================ */
  const presentEl = $('#present');
  const presCount = $('#presCount');
  const presProgress = $('#presProgress');
  let presList = [];
  let presIdx = 0;
  let presenting = false;

  function presFocusSet(id) {
    const set = new Set();
    const add = (nid) => {
      if (set.has(nid)) return;
      set.add(nid);
      const n = doc.nodes[nid];
      if (n && !n.collapsed) (n.children || []).forEach(add);
    };
    add(id);
    return set;
  }

  function presGo(i) {
    if (!presenting || !presList.length) return;
    presIdx = clamp(i, 0, presList.length - 1);
    const id = presList[presIdx];
    const rt = RT.get(id);
    if (!rt) return;

    const focus = presFocusSet(id);
    const curNode = doc.nodes[id];
    if (curNode && !curNode.children.length && curNode.parentId && RT.has(curNode.parentId)) {
      focus.add(curNode.parentId);
    }
    RT.forEach((r) => {
      r.el.classList.toggle('pres-focus', r.id === id);
      r.el.classList.toggle('pres-dim', !focus.has(r.id));
    });
    edgeLayer.classList.add('pres');
    edges.forEach((e) => e.el.classList.toggle('on', focus.has(e.cid)));

    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    focus.forEach((fid) => {
      const r = RT.get(fid);
      if (!r) return;
      x1 = Math.min(x1, r.tx); y1 = Math.min(y1, r.ty);
      x2 = Math.max(x2, r.tx + r.m.w); y2 = Math.max(y2, r.ty + r.m.h);
    });

    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    const padX = Math.min(280, vw * 0.18);
    const padY = Math.min(210, vh * 0.2);
    const bw = Math.max(150, x2 - x1), bh = Math.max(90, y2 - y1);
    const k = clamp(Math.min((vw - padX * 2) / bw, (vh - padY * 2) / bh), 0.38, 2.1);
    animateView({
      k,
      x: vw / 2 - (x1 + x2) / 2 * k,
      y: vh / 2 - (y1 + y2) / 2 * k
    }, 680);

    const hint = $('#presHint');
    if (hint) hint.style.opacity = presIdx === 0 ? '1' : '0';
    presCount.textContent = (presIdx + 1) + ' / ' + presList.length;
    presProgress.style.width = ((presIdx + 1) / presList.length * 100) + '%';
    $('#presPrev').disabled = presIdx === 0;
    $('#presNext').disabled = presIdx === presList.length - 1;
  }

  function startPres() {
    if (presenting) return;
    if (editingId) endEdit(editingId);
    presList = presentOrder().filter((id) => RT.has(id));
    if (!presList.length) return;
    presenting = true;
    presIdx = -1;
    document.body.classList.add('presenting');
    presentEl.classList.add('on');
    select(null);
    hideToolbar();
    menu.classList.remove('show');
    $('#newMenu').classList.remove('show');
    seqPanel.classList.remove('open');
    document.body.classList.remove('seq-visible');
    presGo(0);
  }

  function endPres() {
    if (!presenting) return;
    presenting = false;
    document.body.classList.remove('presenting');
    presentEl.classList.remove('on');
    RT.forEach((r) => r.el.classList.remove('pres-dim', 'pres-focus'));
    edgeLayer.classList.remove('pres');
    edges.forEach((e) => e.el.classList.remove('on'));
    fit(true);
  }

  /* ============================================================
     演示顺序：手动编排演示序列
     ============================================================ */
  const seqPanel = $('#seqPanel');
  const seqList = $('#seqList');
  const seqPool = $('#seqPool');
  let seqDragging = null;

  function autoOrder() {
    const out = [];
    const walk = (id) => {
      if (!doc.nodes[id]) return;
      out.push(id);
      const n = doc.nodes[id];
      if (n && !n.collapsed) (n.children || []).forEach(walk);
    };
    walk(doc.rootId);
    return out;
  }

  function presentOrder() {
    const saved = Array.isArray(doc.order) ? doc.order.filter((id) => doc.nodes[id]) : [];
    return saved.length ? saved : autoOrder().filter((id) => {
      const n = doc.nodes[id];
      return id === doc.rootId || (n && n.children.length > 0);
    });
  }

  function renderSeq() {
    if (!seqList) return;
    seqList.textContent = '';
    const order = presentOrder();
    order.forEach((id, i) => {
      const n = doc.nodes[id];
      const row = document.createElement('div');
      row.className = 'seq-item';
      row.dataset.id = id;
      row.draggable = true;
      const color = (metas.get(id) && metas.get(id).color) || THEMES[doc.theme].accent;
      row.innerHTML =
        '<span class="si-n">' + (i + 1) + '</span>' +
        '<span class="o-dot" style="--c:' + color + '"></span>' +
        '<span class="si-label"></span>' +
        '<button class="si-x" title="移除"><i class="ri-close-line"></i></button>';
      row.querySelector('.si-label').textContent = n.text || '未命名';
      row.querySelector('.si-x').addEventListener('click', () => {
        doc.order = presentOrder().filter((x) => x !== id);
        pushHistory(); persist(); renderSeq();
      });
      row.addEventListener('dragstart', (e) => {
        seqDragging = row;
        row.classList.add('ghosting');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', id); } catch (err) { }
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('ghosting');
        seqDragging = null;
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!seqDragging || seqDragging === row) return;
        const r = row.getBoundingClientRect();
        const after = (e.clientY - r.top) > r.height / 2;
        seqList.insertBefore(seqDragging, after ? row.nextSibling : row);
      });
      row.addEventListener('drop', (e) => { e.preventDefault(); commitSeq(); });
      seqList.appendChild(row);
    });
    if (!order.length) {
      const e = document.createElement('div');
      e.className = 'seq-empty';
      e.textContent = '序列为空 · 演示将自动按大纲巡游';
      seqList.appendChild(e);
    }

    // 待加入的主题
    seqPool.textContent = '';
    const inSeq = new Set(order);
    Object.values(doc.nodes).forEach((n) => {
      if (inSeq.has(n.id) || n.id === doc.rootId) return;
      if (!n.text) return;
      const b = document.createElement('button');
      b.textContent = n.text.slice(0, 12);
      b.title = '加入演示顺序';
      b.addEventListener('click', () => {
        doc.order = presentOrder().concat([n.id]);
        pushHistory(); persist(); renderSeq();
      });
      seqPool.appendChild(b);
    });
    if (!seqPool.children.length) {
      const s = document.createElement('span');
      s.style.cssText = 'font-size:11px;color:var(--ink3);padding:2px 6px';
      s.textContent = '已全部加入';
      seqPool.appendChild(s);
    }
    syncBadges();
  }

  function commitSeq() {
    const ids = [...seqList.querySelectorAll('.seq-item')].map((r) => r.dataset.id);
    const cur = presentOrder();
    const changed = ids.length !== cur.length || ids.some((x, i) => x !== cur[i]);
    doc.order = ids;
    if (changed) { pushHistory(); persist(); renderSeq(); }
  }

  let badgesRendered = false;
  function syncBadges() {
    const order = presentOrder();
    const on = !seqPanel.classList.contains('hide') && seqPanel.classList.contains('open');
    document.body.classList.toggle('seq-visible', on);
    if (!on && badgesRendered) {
      document.querySelectorAll('.seq-badge').forEach((b) => b.remove());
      badgesRendered = false;
      return;
    }
    if (!on) return;
    const map = new Map();
    order.forEach((id, i) => map.set(id, i + 1));
    RT.forEach((rt) => {
      const idx = map.get(rt.id);
      let badge = rt.el.querySelector('.seq-badge');
      if (idx == null) {
        if (badge) badge.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'seq-badge';
        rt.el.appendChild(badge);
      }
      badge.textContent = String(idx);
    });
    badgesRendered = true;
  }

  function toggleSeq(force) {
    const open = force != null ? force : !seqPanel.classList.contains('open');
    seqPanel.classList.toggle('open', open);
    if (open) { outline.classList.remove('open'); document.body.classList.remove('outline-open'); renderSeq(); }
    else document.body.classList.remove('seq-visible');
    refreshAll();
  }

  window.__layoutProbe = () => {
    const r = metas.get(doc.rootId);
    const rt = RT.get(doc.rootId);
    const dom = document.querySelector('.n[data-id="' + doc.rootId + '"]');
    return {
      mode: doc.layout,
      metaXY: r ? [Math.round(r.x), Math.round(r.y)] : null,
      rt: rt ? { tx: Math.round(rt.tx), ty: Math.round(rt.ty), cx: Math.round(rt.cx), cy: Math.round(rt.cy), tf: rt.el.style.transform } : null,
      sameEl: rt && dom ? rt.el === dom : null,
      domTf: dom ? dom.style.transform : null
    };
  };

  /* ---------------- 示例文档 ---------------- */
  function sampleDoc() {
    const nodes = {};
    const mk = (id, text, parentId) => {
      nodes[id] = { id, text, parentId: parentId || null, children: [], collapsed: false, color: null };
      if (parentId) nodes[parentId].children.push(id);
      return id;
    };
    mk('r', 'ZMind · 让思绪成形', null);
    mk('a1', '产品愿景', 'r');
    mk('a1a', '一秒进入心流', 'a1');
    mk('a1b', '思考即呈现', 'a1');
    mk('a2', '设计语言', 'r');
    mk('a2a', '曜石与香槟', 'a2');
    mk('a2b', '玻璃质感', 'a2');
    mk('a2c', '曲线连接', 'a2');
    mk('a3', '核心能力', 'r');
    mk('a3a', '无限画布', 'a3');
    mk('a3b', '智能布局', 'a3');
    mk('a3c', '一键导出', 'a3');
    mk('a3b1', '逻辑图', 'a3b');
    mk('a3b2', '平衡图', 'a3b');
    mk('a3b3', '架构图', 'a3b');
    mk('a4', '上线节奏', 'r');
    mk('a4a', '内测 · 十月', 'a4');
    mk('a4b', '公测 · 十一月', 'a4');
    mk('a4c', '正式版 · 十二月', 'a4');
    mk('a5', '增长策略', 'r');
    mk('a5a', '设计社区', 'a5');
    mk('a5b', '模板市场', 'a5');
    return { title: 'ZMind · 产品发布', theme: 'obsidian', layout: 'balanced', rootId: 'r', nodes };
  }

  /* ---------------- 自定义提示气泡 ----------------
     取代原生 title（延迟、无样式），提供统一、快速、贴合主题的提示。
     通过事件委托处理，动态生成的元素（缩略图主题、序列项等）也自动生效。
  ------------------------------------------------- */
  function setupTips() {
    const tip = document.getElementById('tip');
    if (!tip) return;
    let activeEl = null, hideTimer = 0, showTimer = 0;

    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    function getTip(el) {
      if (el.dataset.tip == null && el.hasAttribute('title')) {
        el.dataset.tip = el.getAttribute('title');
        el.removeAttribute('title'); // 抑制原生气泡
      }
      return el.dataset.tip;
    }
    function html(text) {
      const m = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/); // “标签 (快捷键)” 结构
      if (m) return '<span class="t-label">' + esc(m[1]) + '</span><kbd>' + esc(m[2]) + '</kbd>';
      return esc(text);
    }

    function show(el) {
      const text = getTip(el);
      if (!text) return;
      activeEl = el;
      clearTimeout(hideTimer);
      tip.innerHTML = html(text);
      tip.classList.add('show');
      const r = el.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.left + r.width / 2 - tw / 2;
      let pos = 'top';
      let y = r.top - th - 9;            // 默认在上方
      if (y < 8) { y = r.bottom + 9; pos = 'bottom'; }
      x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
      const ax = Math.max(12, Math.min(tw - 12, (r.left + r.width / 2) - x)); // 箭头对齐触发元素中心
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
      tip.style.setProperty('--ax', ax + 'px');
      tip.classList.toggle('pos-top', pos === 'top');
      tip.classList.toggle('pos-bottom', pos === 'bottom');
      requestAnimationFrame(() => tip.classList.add('in'));
    }
    function hide() {
      if (!activeEl) return;
      activeEl = null;
      tip.classList.remove('in');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { if (!activeEl) tip.classList.remove('show'); }, 160);
    }

    // 悬浮：轻微延迟避免扫过时的闪烁
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip],[title]');
      if (!el || el === activeEl) return;
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(el), 90);
    });
    document.addEventListener('mouseout', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip],[title]');
      if (!el) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      clearTimeout(showTimer);
      hide();
    });
    // 键盘聚焦（无障碍）
    document.addEventListener('focusin', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip],[title]');
      if (el) { clearTimeout(hideTimer); show(el); }
    });
    document.addEventListener('focusout', () => hide());

    // 点击 / 滚动 / 缩放 / 大小变化时隐藏，避免错位或残留
    document.addEventListener('pointerdown', (e) => {
      if (!(e.target.closest && e.target.closest('[data-tip]'))) hide();
    });
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    let saved = null, fromLegacy = false;
    try {
      saved = localStorage.getItem(KEY);
      if (!saved) {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) { saved = legacy; fromLegacy = true; localStorage.setItem(KEY, legacy); }
      }
    } catch (e) { }
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d && d.nodes && d.nodes[d.rootId]) doc = d;
      } catch (e) { }
    }
    if (!doc) doc = sampleDoc();
    if (fromLegacy) {
      // 旧版本品牌名迁移
      if (doc.title) doc.title = String(doc.title).replace(/Aurelia/g, 'ZMind');
      Object.values(doc.nodes || {}).forEach((n) => {
        if (n.text) n.text = String(n.text).replace(/Aurelia/g, 'ZMind');
      });
    }
    if (!THEMES[doc.theme]) doc.theme = 'obsidian';
    if (!['right', 'balanced', 'down'].includes(doc.layout)) doc.layout = 'balanced';

    document.documentElement.dataset.theme = doc.theme;
    delete doc.themeCustom;
    clearLegacyThemeVars();
    titleEl.textContent = doc.title || '未命名导图';

    buildSwatches();
    buildPalette();
    updateSeg();
    bind();
    setupTips();

    history = [snap()];
    hIndex = 0;

    relayout();
    fit(false);
    applyView();
    updateOutline();
    persist();

    let mmPref = '1';
    try { mmPref = localStorage.getItem('zmind.mm') || localStorage.getItem('aurelia.mm') || '1'; } catch (e) { }
    setMinimap(mmPref !== '0', true);
    measureMM();
    drawMinimap();

    const refit = () => {
      mcache.clear();
      relayout();
      if (!userMoved) fit(false);
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    setTimeout(refit, 300);
  }

  boot();
})();
