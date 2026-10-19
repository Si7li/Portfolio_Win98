// Paint for Portfolio 98: a Windows 98 Paint clone drawn on a <canvas>.
// script.js calls Paint98.setup(win, api) for the window marked data-app="paint" and gets back
// { load(url, name), newImage(), onKey(event, typing) }. Nothing is ever stored: File > Save As
// just hands the visitor a PNG, and closing the window throws the picture away.
window.Paint98 = (() => {
  'use strict';

  const TOOLS = [
    { id: 'free-select', name: 'Free-Form Select', hint: 'Selects a free-form part of the picture to move, copy, or edit.',
      svg: '<path d="M3 4l5-2 5 3-1 6-6 2-3-4z" fill="none" stroke="currentColor" stroke-dasharray="2 1"/>' },
    { id: 'select', name: 'Select', hint: 'Selects a rectangular part of the picture to move, copy, or edit.',
      svg: '<rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="currentColor" stroke-dasharray="2 1"/>' },
    { id: 'eraser', name: 'Eraser/Color Eraser', hint: 'Erases a portion of the picture, using the selected eraser shape.',
      svg: '<path d="M3 10l6-6 4 4-6 6H3z" fill="#f2b8c6" stroke="currentColor"/>' },
    { id: 'fill', name: 'Fill With Color', hint: 'Fills an area with the current drawing color.',
      svg: '<path d="M4 7l4-4 5 5-4 4z" fill="#fff" stroke="currentColor"/><path d="M12 9.5c1 1.5 1 3 0 3.5" fill="none" stroke="#00f" stroke-width="1.5"/>' },
    { id: 'pick', name: 'Pick Color', hint: 'Picks up a color from the picture for drawing.',
      svg: '<path d="M3 14l6-6 2 2-6 6H3zM9 5l3-3 2 2-3 3z" fill="currentColor"/>' },
    { id: 'magnifier', name: 'Magnifier', hint: 'Changes the magnification.',
      svg: '<circle cx="6.5" cy="6.5" r="4" fill="#cff" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 9.5l4 4" stroke="currentColor" stroke-width="2"/>' },
    { id: 'pencil', name: 'Pencil', hint: 'Draws a free-form line one pixel wide.',
      svg: '<path d="M3 13l1-3 7-7 2 2-7 7z" fill="#fc0" stroke="currentColor"/>' },
    { id: 'brush', name: 'Brush', hint: 'Draws using a brush with the selected shape and size.',
      svg: '<path d="M9 2l4 4-3 3-4-4z" fill="#963" stroke="currentColor"/><path d="M6 6l-3 3c-1 1-1 4 1 4s3-1 4-3z" fill="currentColor"/>' },
    { id: 'airbrush', name: 'Airbrush', hint: 'Draws using an airbrush of the selected size.',
      svg: '<path d="M2 8h5v6H2z" fill="currentColor"/><path d="M9 4h1v1H9zm3 1h1v1h-1zm-2 3h1v1h-1zm3 2h1v1h-1zm-3 2h1v1h-1z" fill="currentColor"/>' },
    { id: 'text', name: 'Text', hint: 'Inserts text into the picture.',
      svg: '<text x="8" y="13" text-anchor="middle" font-family="Times New Roman, serif" font-weight="bold" font-size="13" fill="currentColor">A</text>' },
    { id: 'line', name: 'Line', hint: 'Draws a straight line with the selected line width.',
      svg: '<path d="M2 13L14 3" stroke="currentColor" stroke-width="1.5"/>' },
    { id: 'curve', name: 'Curve', hint: 'Draws a curved line with the selected line width.',
      svg: '<path d="M2 12c3-10 9 2 12-8" fill="none" stroke="currentColor" stroke-width="1.5"/>' },
    { id: 'rect', name: 'Rectangle', hint: 'Draws a rectangle with the selected fill style.',
      svg: '<rect x="2.5" y="4.5" width="11" height="8" fill="none" stroke="currentColor"/>' },
    { id: 'polygon', name: 'Polygon', hint: 'Draws a polygon with the selected fill style.',
      svg: '<path d="M2.5 12.5l2-8 5 3 4-4v9z" fill="none" stroke="currentColor"/>' },
    { id: 'ellipse', name: 'Ellipse', hint: 'Draws an ellipse with the selected fill style.',
      svg: '<ellipse cx="8" cy="8.5" rx="6" ry="4.5" fill="none" stroke="currentColor"/>' },
    { id: 'rounded', name: 'Rounded Rectangle', hint: 'Draws a rounded rectangle with the selected fill style.',
      svg: '<rect x="2.5" y="4.5" width="11" height="8" rx="3" fill="none" stroke="currentColor"/>' },
  ];

  // The default Windows 98 Paint palette
  const PALETTE = [
    '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
    '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
  ];

  const BRUSHES = [
    { shape: 'circle', size: 7 }, { shape: 'circle', size: 4 }, { shape: 'circle', size: 1 },
    { shape: 'square', size: 8 }, { shape: 'square', size: 5 }, { shape: 'square', size: 2 },
    { shape: 'slash', size: 8 }, { shape: 'slash', size: 5 }, { shape: 'slash', size: 3 },
    { shape: 'backslash', size: 8 }, { shape: 'backslash', size: 5 }, { shape: 'backslash', size: 3 },
  ];
  const ERASERS = [4, 6, 8, 10];
  const AIRBRUSHES = [{ r: 4, dots: 8 }, { r: 8, dots: 16 }, { r: 12, dots: 28 }];
  const WIDTHS = [1, 2, 3, 4, 5];
  const ZOOMS = [1, 2, 4, 8];
  const LARGE_ZOOM = 4;
  const NEW_SIZE = { w: 400, h: 300 };
  const MAX_OPEN = 1600; // bigger pictures are scaled down when opened
  const UNDO_LEVELS = 3; // like the real thing
  const TEXT_SIZE = 16;
  const TEXT_FONT = '"MS Sans Serif", "Microsoft Sans Serif", Tahoma, Arial, sans-serif';
  const DEFAULT_HINT = 'For Help, click Help Topics on the Help Menu.';

  // ---------- Small helpers ----------

  const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const rgbToHex = (r, g, b) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;

  function bresenham(x0, y0, x1, y1, plot) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      plot(x0, y0);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Paints one brush "dab" with axis-aligned fillRects, so nothing gets anti-aliased
  function stamp(t, x, y, shape, size) {
    const o = Math.floor(size / 2);
    if (shape === 'square') return t.fillRect(x - o, y - o, size, size);
    if (shape === 'slash' || shape === 'backslash') {
      for (let i = 0; i < size; i++) t.fillRect(x - o + i, shape === 'slash' ? y + o - i : y - o + i, 1, 1);
      return;
    }
    const r = size / 2;
    for (let row = 0; row < size; row++) {
      const cy = row + 0.5 - r;
      const half = Math.sqrt(Math.max(0, r * r - cy * cy));
      const from = Math.round(r - half);
      const to = Math.round(r + half);
      if (to > from) t.fillRect(x - o + from, y - o + row, to - from, 1);
    }
  }

  function strokePolyline(t, points, closed, width, color) {
    t.fillStyle = color;
    const count = closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      bresenham(a.x, a.y, b.x, b.y, (x, y) => stamp(t, x, y, 'circle', width));
    }
    if (points.length === 1) stamp(t, points[0].x, points[0].y, 'circle', width);
  }

  function rectOutline(t, x, y, w, h, lw) {
    if (w <= 2 * lw || h <= 2 * lw) return t.fillRect(x, y, w, h);
    t.fillRect(x, y, w, lw);
    t.fillRect(x, y + h - lw, w, lw);
    t.fillRect(x, y + lw, lw, h - 2 * lw);
    t.fillRect(x + w - lw, y + lw, lw, h - 2 * lw);
  }

  function ellipsePoints(box, inset) {
    const cx = box.x + (box.w - 1) / 2;
    const cy = box.y + (box.h - 1) / 2;
    const rx = Math.max(0, (box.w - 1) / 2 - inset);
    const ry = Math.max(0, (box.h - 1) / 2 - inset);
    const n = Math.max(16, Math.ceil(Math.PI * 2 * Math.max(rx, ry)));
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: Math.round(cx + rx * Math.cos(a)), y: Math.round(cy + ry * Math.sin(a)) };
    });
  }

  function roundedPoints(box, inset) {
    const x0 = box.x + inset;
    const y0 = box.y + inset;
    const x1 = box.x + box.w - 1 - inset;
    const y1 = box.y + box.h - 1 - inset;
    const r = Math.max(0, Math.min(8, (x1 - x0) / 2, (y1 - y0) / 2));
    const corners = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
    const points = [];
    const steps = Math.max(2, Math.ceil(r));
    for (const [cx, cy, start] of corners) {
      for (let i = 0; i <= steps; i++) {
        const a = start + (i / steps) * (Math.PI / 2);
        points.push({ x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) });
      }
    }
    return points;
  }

  function bezierPoints(a, c1, c2, b) {
    const length = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(b.x - c2.x, b.y - c2.y);
    const n = Math.max(8, Math.ceil(length / 3));
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const u = 1 - t;
      return {
        x: Math.round(u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x),
        y: Math.round(u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y),
      };
    });
  }

  const boundsOf = points => {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
  };

  // Shift: snap a line to horizontal, vertical or 45 degrees
  function constrainLine(a, p) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    if (Math.abs(dx) > 2 * Math.abs(dy)) return { x: p.x, y: a.y };
    if (Math.abs(dy) > 2 * Math.abs(dx)) return { x: a.x, y: p.y };
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx) * d, y: a.y + Math.sign(dy) * d };
  }

  // Box from two corners; Shift makes it a square
  function boxFrom(a, p, square) {
    let dx = p.x - a.x;
    let dy = p.y - a.y;
    if (square) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * d;
      dy = Math.sign(dy || 1) * d;
    }
    return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), w: Math.abs(dx) + 1, h: Math.abs(dy) + 1 };
  }

  const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

  function cloneCanvas(src) {
    const copy = canvasOf(src.width, src.height);
    copy.getContext('2d').drawImage(src, 0, 0);
    return copy;
  }

  // Little pictures for the options box
  const optionSvg = (body, w = 30, h = 14) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${body}</svg>`;
  const brushSvg = ({ shape, size }) => {
    const c = 6;
    const o = Math.floor(size / 2);
    if (shape === 'circle') return optionSvg(`<circle cx="${c}" cy="${c}" r="${Math.max(0.6, size / 2)}" fill="currentColor"/>`, 12, 12);
    if (shape === 'square') return optionSvg(`<rect x="${c - o}" y="${c - o}" width="${size}" height="${size}" fill="currentColor"/>`, 12, 12);
    const [y0, y1] = shape === 'slash' ? [c + o, c - o] : [c - o, c + o];
    return optionSvg(`<path d="M${c - o} ${y0}L${c + o} ${y1}" stroke="currentColor" stroke-width="1.2"/>`, 12, 12);
  };

  // ---------- One Paint window ----------

  function setup(win, api) {
    const el = win.el;
    const toolBox = el.querySelector('.paint-tools');
    const workspace = el.querySelector('.paint-canvas');
    const colorBox = el.querySelector('.paint-colors');
    const statusBar = el.querySelector('.status-bar');
    const [statusHint, statusPos, statusSize] = statusBar.children;

    // Canvas stack: the picture, an overlay for previews and the moving selection, and a scratch
    // canvas used to turn fills and text into hard-edged pixels.
    workspace.innerHTML = '<div class="paint-stage"><canvas class="paint-surface" role="img"></canvas><canvas class="paint-overlay"></canvas></div>';
    const stage = workspace.querySelector('.paint-stage');
    const surface = stage.querySelector('.paint-surface');
    const overlay = stage.querySelector('.paint-overlay');
    const ctx = surface.getContext('2d', { willReadFrequently: true });
    const octx = overlay.getContext('2d', { willReadFrequently: true });
    const scratch = canvasOf(1, 1);
    const sctx = scratch.getContext('2d', { willReadFrequently: true });

    let W = 0;
    let H = 0;
    let zoom = 1;
    let docName = 'untitled';
    let fg = '#000000';
    let bg = '#ffffff';
    let tool = 'pencil';
    let prevTool = 'pencil';
    const opt = { brush: 1, eraser: 1, airbrush: 1, width: 0, fill: 0, zoom: 2, transparent: 0 };
    let history = [];
    let redoStack = [];
    let drag = null; // the gesture in progress
    let sel = null; // { x, y, w, h, mask, float }
    let clipboard = null;
    let poly = null;
    let curve = null;
    let textBox = null;
    let editIndex = 0; // palette slot that Edit Colors changes

    const lineWidth = () => WIDTHS[opt.width];

    // ---------- Building the window ----------

    toolBox.innerHTML =
      `<div class="paint-tool-grid">${TOOLS.map(t =>
        `<button type="button" class="paint-tool" data-tool="${t.id}" title="${t.name}" aria-label="${t.name}" aria-pressed="false">` +
        `<svg viewBox="0 0 16 16" aria-hidden="true">${t.svg}</svg></button>`).join('')}</div>` +
      '<div class="paint-options"></div>';
    const optionsBox = toolBox.querySelector('.paint-options');

    colorBox.innerHTML =
      '<span class="paint-current" aria-hidden="true"><span class="paint-fg"></span><span class="paint-bg"></span></span>' +
      `<span class="paint-palette">${PALETTE.map((c, i) =>
        `<button type="button" class="paint-swatch" data-index="${i}" style="background: ${c}" aria-label="Color ${c}"></button>`).join('')}</span>` +
      '<input type="color" class="paint-color-input" tabindex="-1" aria-hidden="true">';
    const fgBox = colorBox.querySelector('.paint-fg');
    const bgBox = colorBox.querySelector('.paint-bg');
    const colorInput = colorBox.querySelector('.paint-color-input');

    const fileInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
    el.append(fileInput);

    const PALETTE_NOW = [...PALETTE]; // Edit Colors can change the palette
    const setFg = color => { fg = color; fgBox.style.background = color; };
    const setBg = color => { bg = color; bgBox.style.background = color; };
    setFg(fg);
    setBg(bg);

    // ---------- Picture size, zoom, title ----------

    function applyStageSize() {
      stage.style.width = `${W * zoom}px`;
      stage.style.height = `${H * zoom}px`;
      statusSize.textContent = `${W} x ${H}`;
    }

    function resize(w, h, keep = true) {
      const old = keep ? cloneCanvas(surface) : null;
      W = w;
      H = h;
      for (const c of [surface, overlay, scratch]) {
        c.width = w;
        c.height = h;
      }
      ctx.imageSmoothingEnabled = false;
      octx.imageSmoothingEnabled = false;
      ctx.fillStyle = keep ? bg : '#ffffff';
      ctx.fillRect(0, 0, w, h);
      if (old) ctx.drawImage(old, 0, 0);
      applyStageSize();
    }

    function setZoom(z, focus) {
      commitText();
      zoom = z;
      applyStageSize();
      if (focus) {
        workspace.scrollLeft = focus.x * zoom - workspace.clientWidth / 2;
        workspace.scrollTop = focus.y * zoom - workspace.clientHeight / 2;
      }
      if (tool === 'magnifier') renderOptions();
    }

    function setTitle(name) {
      docName = name;
      api.setWindowTitle(win, `${name} - Paint`);
      surface.setAttribute('aria-label', name);
    }

    // Throws away anything half-done, for when the whole picture is replaced
    function discardAll() {
      cancelText();
      poly = null;
      curve = null;
      sel = null;
      drag = null;
    }

    function reset(name) {
      history = [];
      redoStack = [];
      setTitle(name);
      setZoom(1);
      workspace.scrollTop = 0;
      workspace.scrollLeft = 0;
    }

    function newImage() {
      discardAll();
      resize(NEW_SIZE.w, NEW_SIZE.h, false);
      reset('untitled');
    }

    function load(url, name, done) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_OPEN / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        discardAll();
        resize(w, h, false);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, w, h);
        ctx.imageSmoothingEnabled = false;
        reset(name);
        done?.();
      };
      img.onerror = () => {
        api.showMessage('Paint', `Paint cannot read this file.\n\nThis is not a valid bitmap file, or its format is not currently supported.`);
        done?.();
      };
      img.src = url;
    }

    // ---------- Undo / Repeat ----------

    const current = () => ({ w: W, h: H, data: ctx.getImageData(0, 0, W, H) });

    function snapshot() {
      history.push(current());
      if (history.length > UNDO_LEVELS) history.shift();
      redoStack = [];
    }

    function restore(state) {
      if (state.w !== W || state.h !== H) resize(state.w, state.h, false);
      ctx.putImageData(state.data, 0, 0);
      renderOverlay();
    }

    function undo() {
      cancelText();
      poly = null;
      curve = null;
      drag = null;
      sel = null;
      if (!history.length) return renderOverlay();
      redoStack.push(current());
      restore(history.pop());
    }

    function repeat() {
      if (!redoStack.length) return;
      history.push(current());
      restore(redoStack.pop());
    }

    // ---------- Drawing ----------

    // Draws with normal canvas paths onto the scratch canvas, then copies only the pixels that are
    // at least half covered, in one solid color: hard edges like 1998 instead of anti-aliasing.
    function aliasDraw(t, color, box, draw) {
      const x = Math.max(0, Math.floor(box.x) - 2);
      const y = Math.max(0, Math.floor(box.y) - 2);
      const w = Math.min(W, Math.ceil(box.x + box.w) + 2) - x;
      const h = Math.min(H, Math.ceil(box.y + box.h) + 2) - y;
      if (w <= 0 || h <= 0) return;
      sctx.clearRect(x, y, w, h);
      sctx.save();
      sctx.fillStyle = '#000';
      draw(sctx);
      sctx.restore();
      const mask = sctx.getImageData(x, y, w, h).data;
      const out = t.getImageData(x, y, w, h);
      const d = out.data;
      const [r, g, b] = hexToRgb(color);
      for (let i = 3; i < mask.length; i += 4) {
        if (mask[i] >= 128) {
          d[i - 3] = r;
          d[i - 2] = g;
          d[i - 1] = b;
          d[i] = 255;
        }
      }
      t.putImageData(out, x, y);
      sctx.clearRect(x, y, w, h);
    }

    function fillPolygon(t, points, color) {
      if (points.length < 3) return;
      aliasDraw(t, color, boundsOf(points), c => {
        c.beginPath();
        points.forEach((p, i) => (i ? c.lineTo(p.x + 0.5, p.y + 0.5) : c.moveTo(p.x + 0.5, p.y + 0.5)));
        c.closePath();
        c.fill();
      });
    }

    function drawLine(t, a, b, color) {
      t.fillStyle = color;
      bresenham(a.x, a.y, b.x, b.y, (x, y) => stamp(t, x, y, 'circle', lineWidth()));
    }

    // Rectangle, ellipse and rounded rectangle, with the fill style from the options box
    function drawShape(t, kind, box, primary, secondary) {
      const style = opt.fill;
      const lw = lineWidth();
      const outline = style !== 2;
      const filled = style !== 0;
      const fillColor = style === 1 ? secondary : primary;
      if (kind === 'rect') {
        if (filled) {
          t.fillStyle = fillColor;
          t.fillRect(box.x, box.y, box.w, box.h);
        }
        if (outline) {
          t.fillStyle = primary;
          rectOutline(t, box.x, box.y, box.w, box.h, lw);
        }
        return;
      }
      const pointsAt = inset => (kind === 'ellipse' ? ellipsePoints(box, inset) : roundedPoints(box, inset));
      if (filled) fillPolygon(t, pointsAt(0), fillColor);
      if (outline) strokePolyline(t, pointsAt(Math.floor(lw / 2)), true, lw, primary);
    }

    function floodFill(x0, y0, color) {
      if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
      const img = ctx.getImageData(0, 0, W, H);
      const px = new Uint32Array(img.data.buffer);
      const [r, g, b] = hexToRgb(color);
      const fill = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
      const target = px[y0 * W + x0];
      if (target === fill) return;
      const stack = [[x0, y0]];
      while (stack.length) {
        let [x, y] = stack.pop();
        let i = y * W + x;
        while (x >= 0 && px[i] === target) { x--; i--; }
        x++;
        i++;
        let up = false;
        let down = false;
        while (x < W && px[i] === target) {
          px[i] = fill;
          if (y > 0) {
            if (px[i - W] === target) { if (!up) { stack.push([x, y - 1]); up = true; } } else up = false;
          }
          if (y < H - 1) {
            if (px[i + W] === target) { if (!down) { stack.push([x, y + 1]); down = true; } } else down = false;
          }
          x++;
          i++;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // ---------- Overlay: previews, the moving selection, the dashed outline ----------

    function dashedRect(t, r) {
      t.save();
      t.lineWidth = 1;
      t.setLineDash([2, 2]);
      t.strokeStyle = '#000';
      t.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1));
      t.lineDashOffset = 2;
      t.strokeStyle = '#fff';
      t.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1));
      t.restore();
    }

    function renderOverlay(extra) {
      octx.clearRect(0, 0, W, H);
      if (sel?.float) octx.drawImage(sel.float, sel.x, sel.y);
      extra?.(octx);
      if (sel) dashedRect(octx, sel);
    }

    // ---------- Selections ----------

    const inside = (r, p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
    const clampX = x => Math.max(0, Math.min(W - 1, x));
    const clampY = y => Math.max(0, Math.min(H - 1, y));

    function regionData(s) {
      const data = ctx.getImageData(s.x, s.y, s.w, s.h);
      if (s.mask) s.mask.forEach((on, i) => { if (!on) data.data[i * 4 + 3] = 0; });
      return data;
    }

    function clearRegion(s) {
      if (!s.mask) {
        ctx.fillStyle = bg;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        return;
      }
      const data = ctx.getImageData(s.x, s.y, s.w, s.h);
      const [r, g, b] = hexToRgb(bg);
      s.mask.forEach((on, i) => {
        if (on) data.data.set([r, g, b, 255], i * 4);
      });
      ctx.putImageData(data, s.x, s.y);
    }

    function canvasFromData(data) {
      const c = canvasOf(data.width, data.height);
      c.getContext('2d').putImageData(data, 0, 0);
      return c;
    }

    // Transparent mode: background-colored pixels of a selection don't get pasted
    function withoutBackground(src) {
      if (!opt.transparent) return src;
      const c = cloneCanvas(src);
      const cx = c.getContext('2d');
      const data = cx.getImageData(0, 0, c.width, c.height);
      const [r, g, b] = hexToRgb(bg);
      for (let i = 0; i < data.data.length; i += 4) {
        if (data.data[i] === r && data.data[i + 1] === g && data.data[i + 2] === b) data.data[i + 3] = 0;
      }
      cx.putImageData(data, 0, 0);
      return c;
    }

    function liftSelection(copy) {
      if (sel.float) return;
      snapshot();
      sel.float = canvasFromData(regionData(sel));
      if (!copy) clearRegion(sel);
    }

    function commitSelection() {
      if (!sel) return;
      if (sel.float) ctx.drawImage(withoutBackground(sel.float), sel.x, sel.y);
      sel = null;
      renderOverlay();
    }

    function deleteSelection() {
      if (!sel) return;
      if (!sel.float) {
        snapshot();
        clearRegion(sel);
      }
      sel = null;
      renderOverlay();
    }

    function copySelection() {
      if (!sel) return false;
      clipboard = sel.float ? cloneCanvas(sel.float) : canvasFromData(regionData(sel));
      return true;
    }

    function cutSelection() {
      if (copySelection()) deleteSelection();
    }

    function paste() {
      if (!clipboard) return;
      commitText();
      commitSelection();
      snapshot();
      sel = {
        x: Math.floor(workspace.scrollLeft / zoom),
        y: Math.floor(workspace.scrollTop / zoom),
        w: clipboard.width,
        h: clipboard.height,
        mask: null,
        float: cloneCanvas(clipboard),
      };
      setTool('select', true);
      renderOverlay();
    }

    function selectAll() {
      commitText();
      commitSelection();
      sel = { x: 0, y: 0, w: W, h: H, mask: null, float: null };
      setTool('select', true);
      renderOverlay();
    }

    function startMove(p, copy) {
      if (!sel.float) liftSelection(copy);
      else if (copy) ctx.drawImage(withoutBackground(sel.float), sel.x, sel.y); // Ctrl+drag leaves a copy behind
      drag = { mode: 'move', dx: p.x - sel.x, dy: p.y - sel.y };
    }

    // ---------- Text ----------

    function openTextBox(p) {
      const box = document.createElement('textarea');
      box.className = 'paint-text';
      box.spellcheck = false;
      box.wrap = 'off';
      Object.assign(box.style, {
        left: `${p.x * zoom}px`,
        top: `${p.y * zoom}px`,
        font: `${TEXT_SIZE * zoom}px ${TEXT_FONT}`,
        lineHeight: `${Math.round(TEXT_SIZE * 1.25) * zoom}px`,
        color: fg,
        background: opt.transparent ? 'transparent' : bg,
        width: `${160 * zoom}px`,
        height: `${Math.round(TEXT_SIZE * 1.25) * zoom + 4}px`,
      });
      box.addEventListener('input', () => {
        box.style.height = 'auto';
        box.style.height = `${box.scrollHeight}px`;
        box.style.width = `${Math.max(160 * zoom, box.scrollWidth + 8)}px`;
      });
      stage.append(box);
      textBox = { box, x: p.x, y: p.y, color: fg, back: opt.transparent ? null : bg };
      setTimeout(() => box.focus());
    }

    function cancelText() {
      textBox?.box.remove();
      textBox = null;
    }

    function commitText() {
      if (!textBox) return;
      const { box, x, y, color, back } = textBox;
      const lines = box.value.split('\n');
      cancelText();
      if (!lines.join('').trim()) return;
      snapshot();
      const lineHeight = Math.round(TEXT_SIZE * 1.25);
      sctx.font = `${TEXT_SIZE}px ${TEXT_FONT}`;
      const width = Math.ceil(Math.max(...lines.map(l => sctx.measureText(l).width))) + 2;
      const area = { x, y, w: width, h: lines.length * lineHeight };
      if (back) {
        ctx.fillStyle = back;
        ctx.fillRect(area.x, area.y, area.w, area.h);
      }
      aliasDraw(ctx, color, area, c => {
        c.font = `${TEXT_SIZE}px ${TEXT_FONT}`;
        c.textBaseline = 'top';
        lines.forEach((line, i) => c.fillText(line, x + 1, y + 2 + i * lineHeight));
      });
    }

    // ---------- Polygon and curve (they take several clicks) ----------

    function finishPolygon() {
      if (!poly) return;
      const { points, primary, secondary } = poly;
      poly = null;
      if (points.length >= 2) {
        snapshot();
        const style = opt.fill;
        if (style !== 0 && points.length >= 3) fillPolygon(ctx, points, style === 1 ? secondary : primary);
        if (style !== 2) strokePolyline(ctx, points, true, lineWidth(), primary);
      }
      renderOverlay();
    }

    function curvePoints(cv) {
      return cv.c1 ? bezierPoints(cv.a, cv.c1, cv.c2, cv.b) : [cv.a, cv.b];
    }

    function finishCurve() {
      if (!curve) return;
      snapshot();
      strokePolyline(ctx, curvePoints(curve), false, lineWidth(), curve.color);
      curve = null;
      renderOverlay();
    }

    // Esc: drop the half-done shape or text, put down the selection
    function cancelCurrent() {
      cancelText();
      poly = null;
      curve = null;
      drag = null;
      commitSelection();
      renderOverlay();
    }

    // ---------- Tools ----------

    const freehand = (plot, colorFor = o => o.primary) => ({
      down(p, o) {
        snapshot();
        drag = { last: p, color: colorFor(o) };
        ctx.fillStyle = drag.color;
        plot(p.x, p.y);
      },
      move(p) {
        ctx.fillStyle = drag.color;
        bresenham(drag.last.x, drag.last.y, p.x, p.y, plot);
        drag.last = p;
      },
      up() { drag = null; },
    });

    const shapeTool = kind => ({
      down(p, o) { drag = { start: p, end: p, primary: o.primary, secondary: o.secondary }; },
      move(p, e) {
        drag.end = p;
        drag.box = boxFrom(drag.start, p, e.shiftKey);
        renderOverlay(t => drawShape(t, kind, drag.box, drag.primary, drag.secondary));
      },
      up() {
        const box = drag.box || boxFrom(drag.start, drag.end, false);
        snapshot();
        drawShape(ctx, kind, box, drag.primary, drag.secondary);
        drag = null;
        renderOverlay();
      },
    });

    function spray() {
      const { r, dots } = AIRBRUSHES[opt.airbrush];
      ctx.fillStyle = drag.color;
      for (let i = 0; i < dots; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * r;
        ctx.fillRect(Math.round(drag.p.x + Math.cos(angle) * dist), Math.round(drag.p.y + Math.sin(angle) * dist), 1, 1);
      }
    }

    const handlers = {
      pencil: freehand((x, y) => ctx.fillRect(x, y, 1, 1)),
      brush: freehand((x, y) => stamp(ctx, x, y, BRUSHES[opt.brush].shape, BRUSHES[opt.brush].size)),
      eraser: freehand((x, y) => stamp(ctx, x, y, 'square', ERASERS[opt.eraser]), () => bg),
      airbrush: {
        down(p, o) {
          snapshot();
          drag = { p, color: o.primary };
          spray();
          drag.timer = setInterval(spray, 30);
        },
        move(p) { drag.p = p; },
        up() {
          clearInterval(drag.timer);
          drag = null;
        },
      },
      fill: {
        down(p, o) {
          snapshot();
          floodFill(p.x, p.y, o.primary);
        },
      },
      pick: {
        down(p, o) {
          if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return;
          const [r, g, b] = ctx.getImageData(p.x, p.y, 1, 1).data;
          (o.e.button === 2 ? setBg : setFg)(rgbToHex(r, g, b));
          setTool(prevTool);
        },
      },
      magnifier: {
        down(p) { setZoom(zoom === 1 ? ZOOMS[opt.zoom] : 1, p); },
      },
      text: {
        down(p) {
          if (textBox) return commitText();
          openTextBox({ x: clampX(p.x), y: clampY(p.y) });
        },
      },
      line: {
        down(p, o) { drag = { start: p, end: p, color: o.primary }; },
        move(p, e) {
          drag.end = e.shiftKey ? constrainLine(drag.start, p) : p;
          renderOverlay(t => drawLine(t, drag.start, drag.end, drag.color));
        },
        up() {
          snapshot();
          drawLine(ctx, drag.start, drag.end, drag.color);
          drag = null;
          renderOverlay();
        },
      },
      // Drag a line, then drag twice more to bend it (just like the original)
      curve: {
        down(p, o) {
          if (!curve) curve = { a: p, b: p, stage: 0, color: o.primary };
          drag = true;
          handlers.curve.move(p);
        },
        move(p) {
          if (curve.stage === 0) curve.b = p;
          else if (curve.stage === 1) curve.c1 = curve.c2 = p;
          else curve.c2 = p;
          renderOverlay(t => strokePolyline(t, curvePoints(curve), false, lineWidth(), curve.color));
        },
        up() {
          drag = null;
          if (curve.stage === 0 && curve.a.x === curve.b.x && curve.a.y === curve.b.y) {
            curve = null;
            renderOverlay();
          } else if (curve.stage < 2) curve.stage++;
          else finishCurve();
        },
      },
      // Drag the first side, then click each corner; double-click (or click the start) to close
      polygon: {
        down(p, o) {
          if (!poly) poly = { points: [p], primary: o.primary, secondary: o.secondary };
          drag = { p };
          handlers.polygon.move(p, o.e);
        },
        move(p, e) {
          const last = poly.points[poly.points.length - 1];
          drag.p = e.shiftKey ? constrainLine(last, p) : p;
          renderOverlay(t => strokePolyline(t, [...poly.points, drag.p], false, lineWidth(), poly.primary));
        },
        up() {
          const q = drag.p;
          drag = null;
          const first = poly.points[0];
          if (poly.points.length > 2 && Math.abs(q.x - first.x) <= 3 && Math.abs(q.y - first.y) <= 3) return finishPolygon();
          poly.points.push(q);
          renderOverlay(t => strokePolyline(t, poly.points, false, lineWidth(), poly.primary));
        },
      },
      rect: shapeTool('rect'),
      ellipse: shapeTool('ellipse'),
      rounded: shapeTool('rounded'),
      select: {
        down(p, o) {
          if (sel && inside(sel, p)) return startMove(p, o.e.ctrlKey);
          commitSelection();
          drag = { mode: 'marquee', start: p, end: p };
        },
        move(p) {
          if (drag.mode === 'move') {
            sel.x = p.x - drag.dx;
            sel.y = p.y - drag.dy;
            return renderOverlay();
          }
          drag.end = p;
          renderOverlay(t => dashedRect(t, boxFrom({ x: clampX(drag.start.x), y: clampY(drag.start.y) }, { x: clampX(p.x), y: clampY(p.y) }, false)));
        },
        up() {
          if (drag.mode === 'marquee') {
            const r = boxFrom({ x: clampX(drag.start.x), y: clampY(drag.start.y) }, { x: clampX(drag.end.x), y: clampY(drag.end.y) }, false);
            if (r.w > 1 || r.h > 1) sel = { ...r, mask: null, float: null };
          }
          drag = null;
          renderOverlay();
        },
      },
      'free-select': {
        down(p, o) {
          if (sel && inside(sel, p)) return startMove(p, o.e.ctrlKey);
          commitSelection();
          drag = { mode: 'lasso', points: [{ x: clampX(p.x), y: clampY(p.y) }] };
        },
        move(p) {
          if (drag.mode === 'move') return handlers.select.move(p);
          drag.points.push({ x: clampX(p.x), y: clampY(p.y) });
          renderOverlay(t => strokePolyline(t, drag.points, false, 1, '#000'));
        },
        up() {
          if (drag.mode === 'lasso' && drag.points.length > 2) {
            const box = boundsOf(drag.points);
            // Turn the outline into a pixel mask the size of its bounding box
            sctx.clearRect(0, 0, W, H);
            sctx.beginPath();
            drag.points.forEach((q, i) => (i ? sctx.lineTo(q.x + 0.5, q.y + 0.5) : sctx.moveTo(q.x + 0.5, q.y + 0.5)));
            sctx.closePath();
            sctx.fillStyle = '#000';
            sctx.fill();
            const alpha = sctx.getImageData(box.x, box.y, box.w, box.h).data;
            sctx.clearRect(0, 0, W, H);
            const mask = new Uint8Array(box.w * box.h).map((_, i) => (alpha[i * 4 + 3] >= 128 ? 1 : 0));
            if (mask.some(Boolean)) sel = { ...box, mask, float: null };
          }
          drag = null;
          renderOverlay();
        },
      },
    };

    function setTool(id, keepSelection = false) {
      if (id !== tool) {
        commitText();
        if (poly) finishPolygon();
        if (curve) finishCurve();
        if (!keepSelection) commitSelection();
        if (tool !== 'pick') prevTool = tool;
      }
      tool = id;
      toolBox.querySelectorAll('.paint-tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
      overlay.dataset.tool = id;
      renderOptions();
    }

    // ---------- Options box ----------

    const OPTIONS = {
      select: 'transparent', 'free-select': 'transparent', text: 'transparent',
      eraser: 'eraser', magnifier: 'zoom', brush: 'brush', airbrush: 'airbrush',
      line: 'width', curve: 'width', rect: 'fill', polygon: 'fill', ellipse: 'fill', rounded: 'fill',
    };
    const OPTION_ITEMS = {
      transparent: [
        { label: 'Opaque', html: optionSvg('<rect x="3" y="1" width="24" height="12" fill="#fff" stroke="currentColor"/><circle cx="11" cy="7" r="3" fill="#f00"/><rect x="16" y="4" width="7" height="6" fill="#00f"/>') },
        { label: 'Transparent', html: optionSvg('<rect x="3" y="1" width="24" height="12" fill="none" stroke="currentColor" stroke-dasharray="2 1"/><circle cx="11" cy="7" r="3" fill="#f00"/><rect x="16" y="4" width="7" height="6" fill="#00f"/>') },
      ],
      eraser: ERASERS.map(s => ({ label: `${s} pixel eraser`, html: `<span class="paint-opt-square" style="width: ${s}px; height: ${s}px"></span>` })),
      zoom: ZOOMS.map(z => ({ label: `${z}x`, html: `${z}x` })),
      brush: BRUSHES.map(b => ({ label: `${b.shape} brush, ${b.size} pixels`, html: brushSvg(b) })),
      airbrush: AIRBRUSHES.map(({ r }) => ({
        label: `${r * 2} pixel airbrush`,
        html: optionSvg(Array.from({ length: 6 + r }, (_, i) => {
          const a = i * 2.4;
          const d = ((i * 7) % (r + 1)) * 0.9;
          return `<rect x="${(15 + Math.cos(a) * d).toFixed(1)}" y="${(7 + Math.sin(a) * d * 0.5).toFixed(1)}" width="1" height="1" fill="currentColor"/>`;
        }).join('')),
      })),
      width: WIDTHS.map(w => ({ label: `${w} pixel line`, html: `<span class="paint-opt-line" style="height: ${w}px"></span>` })),
      fill: [
        { label: 'Outline', html: optionSvg('<rect x="4.5" y="2.5" width="21" height="9" fill="none" stroke="currentColor"/>') },
        { label: 'Outline and fill', html: optionSvg('<rect x="4.5" y="2.5" width="21" height="9" fill="#808080" stroke="currentColor"/>') },
        { label: 'Fill', html: optionSvg('<rect x="4" y="2" width="22" height="10" fill="#808080"/>') },
      ],
    };

    function renderOptions() {
      const key = OPTIONS[tool];
      optionsBox.replaceChildren();
      optionsBox.dataset.kind = key || '';
      if (!key) return;
      OPTION_ITEMS[key].forEach((item, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'paint-option';
        btn.innerHTML = item.html;
        btn.setAttribute('aria-label', item.label);
        btn.setAttribute('aria-pressed', String(key === 'zoom' ? ZOOMS[i] === zoom : opt[key] === i));
        btn.addEventListener('click', () => {
          opt[key] = i;
          if (key === 'zoom') setZoom(ZOOMS[i]);
          if (key === 'transparent' && textBox) textBox.box.style.background = i ? 'transparent' : bg;
          renderOptions();
        });
        optionsBox.append(btn);
      });
    }

    // ---------- Pointer input ----------

    function canvasPoint(e) {
      const r = overlay.getBoundingClientRect();
      return { x: Math.floor((e.clientX - r.left) / zoom), y: Math.floor((e.clientY - r.top) / zoom) };
    }

    overlay.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      overlay.setPointerCapture(e.pointerId);
      const right = e.button === 2;
      handlers[tool].down?.(canvasPoint(e), { e, primary: right ? bg : fg, secondary: right ? fg : bg });
    });

    overlay.addEventListener('pointermove', e => {
      const p = canvasPoint(e);
      statusPos.textContent = p.x >= 0 && p.y >= 0 && p.x < W && p.y < H ? `${p.x},${p.y}` : '';
      if (drag) handlers[tool].move?.(p, e);
      else if (tool === 'eraser' && !sel) {
        const s = ERASERS[opt.eraser];
        const o = Math.floor(s / 2);
        renderOverlay(t => {
          t.strokeStyle = '#000';
          t.strokeRect(p.x - o + 0.5, p.y - o + 0.5, s - 1, s - 1);
        });
      }
    });

    overlay.addEventListener('pointerup', e => { if (drag) handlers[tool].up?.(canvasPoint(e), e); });
    overlay.addEventListener('pointercancel', e => { if (drag) handlers[tool].up?.(canvasPoint(e), e); });
    overlay.addEventListener('pointerleave', () => {
      statusPos.textContent = '';
      if (tool === 'eraser' && !drag) renderOverlay();
    });
    overlay.addEventListener('dblclick', () => { if (tool === 'polygon') finishPolygon(); });
    for (const target of [overlay, colorBox]) target.addEventListener('contextmenu', e => e.preventDefault());

    // Clicking the gray area around the picture puts down the selection or text
    workspace.addEventListener('pointerdown', e => {
      if (e.target === workspace) {
        commitText();
        commitSelection();
      }
    });

    toolBox.addEventListener('click', e => {
      const btn = e.target.closest('.paint-tool');
      if (btn) setTool(btn.dataset.tool);
    });
    toolBox.addEventListener('pointerover', e => {
      const btn = e.target.closest('.paint-tool');
      statusHint.textContent = btn ? TOOLS.find(t => t.id === btn.dataset.tool).hint : DEFAULT_HINT;
    });
    toolBox.addEventListener('pointerleave', () => { statusHint.textContent = DEFAULT_HINT; });

    // Palette: left click = drawing color, right click = background color, double-click = edit
    colorBox.addEventListener('click', e => {
      const swatch = e.target.closest('.paint-swatch');
      if (!swatch) return;
      editIndex = Number(swatch.dataset.index);
      setFg(PALETTE_NOW[editIndex]);
    });
    colorBox.addEventListener('contextmenu', e => {
      const swatch = e.target.closest('.paint-swatch');
      if (swatch) setBg(PALETTE_NOW[Number(swatch.dataset.index)]);
    });
    colorBox.addEventListener('dblclick', e => { if (e.target.closest('.paint-swatch')) editColors(); });

    function editColors() {
      colorInput.value = fg;
      if (colorInput.showPicker) colorInput.showPicker();
      else colorInput.click();
    }
    colorInput.addEventListener('input', () => {
      setFg(colorInput.value);
      PALETTE_NOW[editIndex] = colorInput.value;
      colorBox.querySelector(`.paint-swatch[data-index="${editIndex}"]`).style.background = colorInput.value;
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      const url = URL.createObjectURL(file);
      load(url, file.name, () => URL.revokeObjectURL(url));
    });

    // ---------- Image menu ----------

    function transformImage(draw) {
      commitText();
      commitSelection();
      snapshot();
      draw(cloneCanvas(surface));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      renderOverlay();
    }

    const flip = (h, v) => transformImage(src => {
      ctx.setTransform(h ? -1 : 1, 0, 0, v ? -1 : 1, h ? W : 0, v ? H : 0);
      ctx.drawImage(src, 0, 0);
    });

    const rotate = degrees => transformImage(src => {
      if (degrees === 180) {
        ctx.setTransform(-1, 0, 0, -1, W, H);
        return ctx.drawImage(src, 0, 0);
      }
      const [oldW, oldH] = [W, H];
      resize(oldH, oldW, false);
      if (degrees === 90) ctx.setTransform(0, 1, -1, 0, oldH, 0);
      else ctx.setTransform(0, -1, 1, 0, 0, oldW);
      ctx.drawImage(src, 0, 0);
    });

    function invertColors() {
      transformImage(() => {
        const img = ctx.getImageData(0, 0, W, H);
        for (let i = 0; i < img.data.length; i += 4) {
          img.data[i] = 255 - img.data[i];
          img.data[i + 1] = 255 - img.data[i + 1];
          img.data[i + 2] = 255 - img.data[i + 2];
        }
        ctx.putImageData(img, 0, 0);
      });
    }

    function clearImage() {
      transformImage(() => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
      });
    }

    // Image > Attributes: the picture size
    const attrWin = document.getElementById('paint-attributes');
    const attrW = document.getElementById('paint-attr-width');
    const attrH = document.getElementById('paint-attr-height');

    function openAttributes() {
      attrW.value = W;
      attrH.value = H;
      api.openWindow('paint-attributes');
      attrW.focus();
      attrW.select();
    }

    function applyAttributes() {
      const w = Math.round(Number(attrW.value));
      const h = Math.round(Number(attrH.value));
      if (!(w >= 1 && w <= 2000 && h >= 1 && h <= 2000)) {
        return api.showMessage('Paint', 'Please enter a width and height between 1 and 2000 pixels.');
      }
      api.closeWindow('paint-attributes');
      commitText();
      commitSelection();
      snapshot();
      resize(w, h, true);
      renderOverlay();
    }
    document.getElementById('paint-attr-ok').addEventListener('click', applyAttributes);
    attrWin.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyAttributes();
      }
    });

    function saveAs() {
      commitText();
      commitSelection();
      surface.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        api.saveAs(url, `${docName.replace(/\.[^.]+$/, '')}.png`);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    }

    // ---------- Menus ----------

    const hasSelection = () => sel !== null;
    const toggle = box => () => { box.hidden = !box.hidden; };
    const withCommit = fn => () => {
      commitText();
      fn();
    };

    el.querySelector('.title-bar').after(api.buildMenuBar(win, [
      { label: 'File', items: [
        { label: 'New', action: newImage },
        { label: 'Open...', action: () => fileInput.click() },
        { label: 'Save As...', action: saveAs },
        { separator: true },
        { label: 'Exit', action: () => api.closeWindow(el.id) },
      ] },
      { label: 'Edit', items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', enabled: () => history.length > 0, action: undo },
        { label: 'Repeat', shortcut: 'Ctrl+Y', enabled: () => redoStack.length > 0, action: repeat },
        { separator: true },
        { label: 'Cut', shortcut: 'Ctrl+X', enabled: hasSelection, action: cutSelection },
        { label: 'Copy', shortcut: 'Ctrl+C', enabled: hasSelection, action: copySelection },
        { label: 'Paste', shortcut: 'Ctrl+V', enabled: () => clipboard !== null, action: paste },
        { label: 'Clear Selection', shortcut: 'Del', enabled: hasSelection, action: deleteSelection },
        { label: 'Select All', shortcut: 'Ctrl+L', action: selectAll },
      ] },
      { label: 'View', items: [
        { label: 'Tool Box', checked: () => !toolBox.hidden, action: toggle(toolBox) },
        { label: 'Color Box', checked: () => !colorBox.hidden, action: toggle(colorBox) },
        { label: 'Status Bar', checked: () => !statusBar.hidden, action: toggle(statusBar) },
        { separator: true },
        { label: 'Normal Size', radio: true, checked: () => zoom === 1, action: () => setZoom(1) },
        { label: 'Large Size', radio: true, checked: () => zoom === LARGE_ZOOM, action: () => setZoom(LARGE_ZOOM) },
      ] },
      { label: 'Image', items: [
        { label: 'Flip Horizontal', action: () => flip(true, false) },
        { label: 'Flip Vertical', action: () => flip(false, true) },
        { label: 'Rotate 90°', action: () => rotate(90) },
        { label: 'Rotate 180°', action: () => rotate(180) },
        { label: 'Rotate 270°', action: () => rotate(270) },
        { separator: true },
        { label: 'Invert Colors', shortcut: 'Ctrl+I', action: invertColors },
        { label: 'Attributes...', shortcut: 'Ctrl+E', action: withCommit(openAttributes) },
        { label: 'Clear Image', shortcut: 'Ctrl+Shift+N', action: clearImage },
      ] },
      { label: 'Colors', items: [
        { label: 'Edit Colors...', action: editColors },
      ] },
      { label: 'Help', items: [
        { label: 'About Paint', action: () => api.openWindow('about-site') },
      ] },
    ]));

    // ---------- Keyboard ----------

    function onKey(e, typing) {
      if (typing) {
        if (e.key === 'Escape' && textBox) {
          cancelText();
          return true;
        }
        return false;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && key === 'z') undo();
      else if (ctrl && key === 'y') repeat();
      else if (ctrl && key === 'x') cutSelection();
      else if (ctrl && key === 'c') return copySelection();
      else if (ctrl && key === 'v') paste();
      else if (ctrl && (key === 'l' || key === 'a')) selectAll();
      else if (ctrl && key === 'i') invertColors();
      else if (ctrl && key === 'e') withCommit(openAttributes)();
      else if (ctrl && e.shiftKey && key === 'n') clearImage();
      else if (e.key === 'Delete') deleteSelection();
      else if (e.key === 'Escape') cancelCurrent();
      else return false;
      return true;
    }

    // ---------- Start ----------

    statusHint.textContent = DEFAULT_HINT;
    setTool('pencil');
    newImage();

    return { load, newImage, onKey };
  }

  return { setup };
})();
