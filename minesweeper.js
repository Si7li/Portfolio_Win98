// Minesweeper for Portfolio 98, like the one that came with Windows 98.
// script.js calls Minesweeper98.setup(win, api) for the window marked data-app="minesweeper" and
// gets back { newGame(), onKey(event) }. Level, marks and best times are kept in this browser only.
window.Minesweeper98 = (() => {
  'use strict';

  const LEVELS = {
    beginner: { w: 9, h: 9, mines: 10, name: 'Beginner' },
    intermediate: { w: 16, h: 16, mines: 40, name: 'Intermediate' },
    expert: { w: 30, h: 16, mines: 99, name: 'Expert' },
  };
  const LONG_PRESS = 400; // ms on a touch screen to plant a flag

  const STORE_KEY = 'minesweeper';
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } },
    set(value) { try { localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch { /* storage blocked */ } },
  };

  // Seven-segment digits for the red counters (each digit is 13 x 23)
  const SEGMENTS = {
    a: 'M2 1h9l-2 2H4z', b: 'M12 2v9l-2-1V4z', c: 'M12 12v9l-2-2v-6z', d: 'M2 22h9l-2-2H4z',
    e: 'M1 12v9l2-2v-6z', f: 'M1 2v9l2-1V4z', g: 'M2 11.5l2-1h5l2 1-2 1H4z',
  };
  const DIGITS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };

  function led(text) {
    const parts = [...text].map((ch, i) => Object.entries(SEGMENTS).map(([seg, d]) =>
      `<path transform="translate(${i * 13} 0)" d="${d}" fill="${DIGITS[ch].includes(seg) ? '#ff0000' : '#400000'}"/>`).join(''));
    return `<svg viewBox="0 0 39 23" width="39" height="23" aria-hidden="true">${parts.join('')}</svg>`;
  }

  const ledText = n => (n < 0 ? `-${String(Math.min(99, -n)).padStart(2, '0')}` : String(Math.min(999, n)).padStart(3, '0'));

  const EYES = '<rect x="5" y="5" width="2" height="2"/><rect x="10" y="5" width="2" height="2"/>';
  const SMILE = '<path d="M5 10.5q3.5 3 7 0" fill="none" stroke="#000"/>';
  const FACES = {
    smile: EYES + SMILE,
    oh: `${EYES}<circle cx="8.5" cy="11.5" r="1.6" fill="none" stroke="#000"/>`,
    win: `<path d="M3 5h11v1.5l-1 1.5h-2.5l-1-1.5h-2l-1 1.5H4L3 6.5z"/>${SMILE}`,
    dead: '<path d="M5 5l2 2M7 5l-2 2M10 5l2 2M12 5l-2 2" stroke="#000"/><path d="M5 12.5q3.5-3 7 0" fill="none" stroke="#000"/>',
  };
  const face = name => `<svg viewBox="0 0 17 17" width="17" height="17" aria-hidden="true"><circle cx="8.5" cy="8.5" r="7.5" fill="#ff0" stroke="#000"/>${FACES[name]}</svg>`;

  function setup(win, api) {
    const el = win.el;
    const body = el.querySelector('.mine-body');
    body.innerHTML =
      '<div class="mine-panel"><span class="mine-led" aria-label="Mines left"></span>' +
      '<button type="button" class="mine-face" aria-label="New game"></button>' +
      '<span class="mine-led" aria-label="Seconds"></span></div>' +
      '<div class="mine-board" aria-label="Minesweeper board"></div>';
    const [countLed, timeLed] = body.querySelectorAll('.mine-led');
    const faceButton = body.querySelector('.mine-face');
    const board = body.querySelector('.mine-board');

    const saved = store.get();
    let level = saved.level in LEVELS || saved.level === 'custom' ? saved.level : 'beginner';
    let custom = saved.custom || { ...LEVELS.beginner };
    let marks = saved.marks !== false;
    const best = saved.best || {};
    const persist = () => store.set({ level, custom, marks, best });

    let W;
    let H;
    let MINES;
    let cells = []; // { mine, n, open, mark } with mark 0 = none, 1 = flag, 2 = question mark
    let started = false;
    let over = false;
    let flags = 0;
    let opened = 0;
    let seconds = 0;
    let timer = null;

    const setFace = name => { faceButton.innerHTML = face(name); };
    const updateCount = () => { countLed.innerHTML = led(ledText(MINES - flags)); };
    const updateTime = () => { timeLed.innerHTML = led(ledText(seconds)); };
    const config = () => (level === 'custom' ? custom : LEVELS[level]);

    function neighbors(i) {
      const x = i % W;
      const y = Math.floor(i / W);
      const list = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H) list.push(ny * W + nx);
        }
      }
      return list;
    }

    function newGame() {
      clearInterval(timer);
      timer = null;
      ({ w: W, h: H, mines: MINES } = config());
      cells = Array.from({ length: W * H }, () => ({ mine: false, n: 0, open: false, mark: 0 }));
      started = false;
      over = false;
      flags = 0;
      opened = 0;
      seconds = 0;
      board.style.gridTemplateColumns = `repeat(${W}, 16px)`;
      board.replaceChildren(...cells.map((_, i) => {
        const cell = document.createElement('div');
        cell.className = 'mine-cell';
        cell.dataset.i = i;
        return cell;
      }));
      setFace('smile');
      updateCount();
      updateTime();
    }

    // Mines go down on the first click, never under it (just like Windows did)
    function placeMines(safe) {
      const spots = cells.map((_, i) => i).filter(i => i !== safe);
      for (let k = 0; k < MINES; k++) {
        const pick = k + Math.floor(Math.random() * (spots.length - k));
        [spots[k], spots[pick]] = [spots[pick], spots[k]];
        cells[spots[k]].mine = true;
      }
      cells.forEach((c, i) => { c.n = neighbors(i).filter(j => cells[j].mine).length; });
    }

    function paint(i, extra = '') {
      const c = cells[i];
      const cell = board.children[i];
      let cls = 'mine-cell';
      let text = '';
      if (c.open) {
        cls += ' open';
        if (c.mine) cls += ' mine';
        else if (c.n) {
          cls += ` n${c.n}`;
          text = String(c.n);
        }
      } else if (c.mark === 1) cls += ' flag';
      else if (c.mark === 2) {
        cls += ' question';
        text = '?';
      }
      cell.className = cls + extra;
      cell.textContent = text;
    }

    function startTimer() {
      started = true;
      seconds = 1;
      updateTime();
      timer = setInterval(() => {
        if (seconds < 999) seconds++;
        updateTime();
      }, 1000);
    }

    function reveal(i) {
      const c = cells[i];
      if (over || c.open || c.mark === 1) return;
      if (!started) {
        placeMines(i);
        startTimer();
      }
      if (c.mine) return lose(i);
      const stack = [i];
      while (stack.length) {
        const j = stack.pop();
        const cell = cells[j];
        if (cell.open || cell.mark === 1) continue;
        cell.open = true;
        cell.mark = 0;
        opened++;
        paint(j);
        if (cell.n === 0) neighbors(j).forEach(k => { if (!cells[k].open && !cells[k].mine) stack.push(k); });
      }
      if (opened === W * H - MINES) winGame();
    }

    function toggleMark(i) {
      const c = cells[i];
      if (over || c.open) return;
      if (c.mark === 0) {
        c.mark = 1;
        flags++;
      } else if (c.mark === 1) {
        c.mark = marks ? 2 : 0;
        flags--;
      } else c.mark = 0;
      paint(i);
      updateCount();
    }

    // Both buttons (or the middle one) on a number whose flags are all placed opens the rest around it
    function chord(i) {
      const c = cells[i];
      if (over || !c.open || !c.n) return;
      const around = neighbors(i);
      if (around.filter(j => cells[j].mark === 1).length !== c.n) return;
      around.forEach(j => { if (!over && !cells[j].open && cells[j].mark !== 1) reveal(j); });
    }

    function lose(hit) {
      over = true;
      clearInterval(timer);
      cells.forEach((c, j) => {
        if (c.mine && c.mark !== 1) {
          c.open = true;
          paint(j, j === hit ? ' exploded' : '');
        } else if (!c.mine && c.mark === 1) {
          board.children[j].className = 'mine-cell open wrong';
          board.children[j].textContent = '';
        }
      });
      setFace('dead');
    }

    function winGame() {
      over = true;
      clearInterval(timer);
      cells.forEach((c, j) => {
        if (c.mine) {
          c.mark = 1;
          paint(j);
        }
      });
      flags = MINES;
      updateCount();
      setFace('win');
      if (level !== 'custom' && seconds < (best[level]?.time ?? 1000)) askName();
    }

    // ---------- Pressing cells (mouse) ----------

    let press = null; // { chord }
    const cellAt = (x, y) => {
      const target = document.elementFromPoint(x, y);
      return target?.classList.contains('mine-cell') && board.contains(target) ? Number(target.dataset.i) : -1;
    };

    function showPressed(i, both) {
      board.querySelectorAll('.pressed').forEach(cell => cell.classList.remove('pressed'));
      if (i < 0 || over) return;
      for (const j of both ? [i, ...neighbors(i)] : [i]) {
        if (!cells[j].open && cells[j].mark !== 1) board.children[j].classList.add('pressed');
      }
    }

    board.addEventListener('mousedown', e => {
      if (over) return;
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      if (press && e.button === 2) press.chord = true; // right button joins a held left button
      else if (e.button === 2 && !(e.buttons & 1)) return toggleMark(i);
      else press = { chord: e.button === 1 || (e.buttons & 3) === 3 };
      showPressed(i, press.chord);
      setFace('oh');
    });

    document.addEventListener('mousemove', e => {
      if (press) showPressed(cellAt(e.clientX, e.clientY), press.chord);
    });

    document.addEventListener('mouseup', e => {
      if (!press) return;
      const i = cellAt(e.clientX, e.clientY);
      const both = press.chord;
      press = null;
      showPressed(-1);
      if (!over) setFace('smile');
      if (i < 0) return;
      if (both) chord(i);
      else if (e.button === 0) reveal(i);
    });

    board.addEventListener('contextmenu', e => e.preventDefault());

    // ---------- Touch: tap to open, hold to flag, tap a number to clear around it ----------

    let touch = null;
    board.addEventListener('touchstart', e => {
      if (over || e.touches.length > 1) return;
      const t = e.touches[0];
      const i = cellAt(t.clientX, t.clientY);
      if (i < 0) return;
      touch = { i, done: false };
      touch.timer = setTimeout(() => {
        touch.done = true;
        toggleMark(i);
        navigator.vibrate?.(15);
      }, LONG_PRESS);
      showPressed(i, cells[i].open);
      setFace('oh');
    }, { passive: true });

    board.addEventListener('touchmove', e => {
      if (!touch) return;
      const t = e.touches[0];
      if (cellAt(t.clientX, t.clientY) !== touch.i) {
        clearTimeout(touch.timer);
        touch.done = true; // it became a scroll
        showPressed(-1);
      }
    }, { passive: true });

    board.addEventListener('touchend', e => {
      if (!touch) return;
      clearTimeout(touch.timer);
      const { i, done } = touch;
      touch = null;
      showPressed(-1);
      if (!over) setFace('smile');
      e.preventDefault(); // no pretend mouse clicks afterwards
      if (done) return;
      if (cells[i].open) chord(i);
      else reveal(i);
    });

    faceButton.addEventListener('click', newGame);

    // ---------- Dialogs: Custom Field, Best Times, new record ----------

    const customFields = ['height', 'width', 'mines'].map(name => document.getElementById(`mine-custom-${name}`));

    function openCustom() {
      const c = config();
      [customFields[0].value, customFields[1].value, customFields[2].value] = [c.h, c.w, c.mines];
      api.openWindow('mine-custom');
      customFields[0].focus();
      customFields[0].select();
    }

    function applyCustom() {
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo));
      const h = clamp(customFields[0].value, 9, 24);
      const w = clamp(customFields[1].value, 9, 30);
      const mines = clamp(customFields[2].value, 10, (h - 1) * (w - 1));
      custom = { w, h, mines };
      level = 'custom';
      persist();
      api.closeWindow('mine-custom');
      newGame();
    }
    document.getElementById('mine-custom-ok').addEventListener('click', applyCustom);
    document.getElementById('mine-custom').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCustom();
      }
    });

    function showBest() {
      for (const key of Object.keys(LEVELS)) {
        document.getElementById(`mine-best-${key}-time`).textContent = `${best[key]?.time ?? 999} seconds`;
        document.getElementById(`mine-best-${key}-name`).textContent = best[key]?.name ?? 'Anonymous';
      }
      api.openWindow('mine-best');
    }
    document.getElementById('mine-best-reset').addEventListener('click', () => {
      for (const key of Object.keys(LEVELS)) delete best[key];
      persist();
      showBest();
    });

    const recordName = document.getElementById('mine-record-name');
    function askName() {
      document.getElementById('mine-record-level').textContent = LEVELS[level].name.toLowerCase();
      recordName.value = best[level]?.name || 'Anonymous';
      api.openWindow('mine-record');
      recordName.focus();
      recordName.select();
    }
    function saveRecord() {
      best[level] = { time: seconds, name: recordName.value.trim().slice(0, 32) || 'Anonymous' };
      persist();
      api.closeWindow('mine-record');
      showBest();
    }
    document.getElementById('mine-record-ok').addEventListener('click', saveRecord);
    recordName.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveRecord();
      }
    });

    // ---------- Menus ----------

    const pickLevel = key => () => {
      level = key;
      persist();
      newGame();
    };

    el.querySelector('.title-bar').after(api.buildMenuBar(win, [
      { label: 'Game', items: [
        { label: 'New', shortcut: 'F2', action: newGame },
        { separator: true },
        { label: 'Beginner', radio: true, checked: () => level === 'beginner', action: pickLevel('beginner') },
        { label: 'Intermediate', radio: true, checked: () => level === 'intermediate', action: pickLevel('intermediate') },
        { label: 'Expert', radio: true, checked: () => level === 'expert', action: pickLevel('expert') },
        { label: 'Custom...', radio: true, checked: () => level === 'custom', action: openCustom },
        { separator: true },
        { label: 'Marks (?)', checked: () => marks, action: () => { marks = !marks; persist(); } },
        { separator: true },
        { label: 'Best Times...', action: showBest },
        { separator: true },
        { label: 'Exit', action: () => api.closeWindow(el.id) },
      ] },
      { label: 'Help', items: [
        { label: 'About Minesweeper', action: () => api.openWindow('about-site') },
      ] },
    ]));

    function onKey(e) {
      if (e.key !== 'F2') return false;
      newGame();
      return true;
    }

    newGame();
    return { newGame, onKey };
  }

  return { setup };
})();
