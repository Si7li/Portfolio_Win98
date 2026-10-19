// Portfolio 98 - window manager, start menu, taskbar and clock.
(() => {
  'use strict';

  const desktop = document.getElementById('desktop');
  const taskList = document.getElementById('task-list');
  const startButton = document.getElementById('start-button');
  const startMenu = document.getElementById('start-menu');
  const shutdownScreen = document.getElementById('shutdown-screen');
  const smallScreen = matchMedia('(max-width: 700px)');

  const windows = new Map(); // id -> { el, task, placed }
  let topZ = 10;
  let cascade = 0;

  // localStorage can throw in private windows or with blocked site data
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  };

  // ---------- Windows ----------

  function buildWindow(el) {
    const isDialog = el.classList.contains('dialog');
    const bar = document.createElement('div');
    bar.className = 'title-bar';
    bar.innerHTML =
      (el.dataset.icon ? `<img class="title-icon" src="${el.dataset.icon}" alt="">` : '') +
      '<span class="title-text"></span><div class="title-controls">' +
      (isDialog ? '' : '<button type="button" class="tb-min" aria-label="Minimize"></button>' +
                       '<button type="button" class="tb-max" aria-label="Maximize"></button>') +
      '<button type="button" class="tb-close" aria-label="Close"></button></div>';
    bar.querySelector('.title-text').textContent = el.dataset.title;
    el.prepend(bar);
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', el.dataset.title);
    el.tabIndex = -1;

    const win = { el, task: null, placed: false };
    windows.set(el.id, win);

    bar.querySelector('.tb-close').addEventListener('click', () => closeWindow(el.id));
    bar.querySelector('.tb-min')?.addEventListener('click', () => minimizeWindow(el.id));
    bar.querySelector('.tb-max')?.addEventListener('click', () => toggleMaximize(el.id));
    if (!isDialog) {
      bar.addEventListener('dblclick', e => { if (!e.target.closest('button')) toggleMaximize(el.id); });
    }
    el.addEventListener('pointerdown', () => focusWindow(el.id));
    makeDraggable(win, bar);
  }

  function place(win) {
    const { el } = win;
    el.style.width = `${Number(el.dataset.width) || 480}px`;
    const maxLeft = Math.max(0, desktop.clientWidth - el.offsetWidth);
    const maxTop = Math.max(0, desktop.clientHeight - el.offsetHeight);
    let left, top;
    if (el.classList.contains('dialog')) {
      left = maxLeft / 2;
      top = maxTop / 3;
    } else {
      left = 110 + cascade * 26;
      top = 20 + cascade * 26;
      cascade = (cascade + 1) % 8;
    }
    el.style.left = `${Math.round(Math.min(left, maxLeft))}px`;
    el.style.top = `${Math.round(Math.min(top, maxTop))}px`;
    win.placed = true;
  }

  // Windows with <iframe data-src> (DOOM) load it when opened and unload it when closed
  function setFrames(win, loaded) {
    win.el.querySelectorAll('iframe[data-src]').forEach(frame => {
      const src = loaded ? frame.dataset.src : 'about:blank';
      if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
    });
  }

  function messageFrames(win, message) {
    win.el.querySelectorAll('iframe[data-src]').forEach(frame => frame.contentWindow?.postMessage(message, '*'));
  }

  function openWindow(id) {
    const win = windows.get(id);
    if (!win) return;
    if (win.el.hidden) {
      win.el.hidden = false;
      if (!win.placed) place(win);
      addTask(win);
      setFrames(win, true);
    }
    if (win.el.classList.contains('minimized')) messageFrames(win, 'resume');
    win.el.classList.remove('minimized');
    focusWindow(id);
    // Dialogs (welcome, about this site) don't get their own link
    if (!win.el.classList.contains('dialog')) setHash(id);
  }

  function closeWindow(id) {
    const win = windows.get(id);
    if (!win || win.el.hidden) return;
    win.el.hidden = true;
    win.el.classList.remove('minimized', 'maximized');
    setFrames(win, false);
    win.task?.remove();
    win.task = null;
    if (location.hash === `#${id}`) setHash('');
    focusTopmost();
  }

  function minimizeWindow(id) {
    const win = windows.get(id);
    if (!win) return;
    win.el.classList.add('minimized');
    messageFrames(win, 'pause');
    focusTopmost();
  }

  function toggleMaximize(id) {
    const win = windows.get(id);
    if (!win) return;
    const maximized = win.el.classList.toggle('maximized');
    win.el.querySelector('.tb-max')?.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
  }

  function focusWindow(id) {
    const win = windows.get(id);
    windows.forEach(w => {
      w.el.classList.toggle('active', w === win);
      w.task?.classList.toggle('active', w === win);
    });
    if (!win) return;
    win.el.style.zIndex = ++topZ;
    // Focus the game itself in the DOOM window so the keyboard goes straight to it
    if (!win.el.contains(document.activeElement)) (win.el.querySelector('iframe') || win.el).focus({ preventScroll: true });
  }

  // Clicks inside an iframe never reach this page; the page losing focus to it is the only sign
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const frameWindow = document.activeElement?.tagName === 'IFRAME' && document.activeElement.closest('.window');
      if (frameWindow && !frameWindow.classList.contains('active')) focusWindow(frameWindow.id);
    });
  });

  function focusTopmost() {
    let best = null;
    windows.forEach(w => {
      if (w.el.hidden || w.el.classList.contains('minimized')) return;
      if (!best || Number(w.el.style.zIndex) > Number(best.el.style.zIndex)) best = w;
    });
    focusWindow(best?.el.id);
  }

  function addTask(win) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'task';
    if (win.el.dataset.icon) btn.innerHTML = `<img src="${win.el.dataset.icon}" alt="">`;
    const label = document.createElement('span');
    label.textContent = win.el.dataset.title;
    btn.append(label);
    btn.addEventListener('click', () => {
      if (win.el.classList.contains('active')) minimizeWindow(win.el.id);
      else openWindow(win.el.id);
    });
    taskList.append(btn);
    win.task = btn;
  }

  function makeDraggable(win, bar) {
    bar.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      if (win.el.classList.contains('maximized') || smallScreen.matches) return;
      const offsetX = e.clientX - win.el.offsetLeft;
      const offsetY = e.clientY - win.el.offsetTop;
      bar.setPointerCapture(e.pointerId);

      const move = ev => {
        // Keep at least 40px of the window and the whole title bar reachable
        const x = Math.min(Math.max(ev.clientX - offsetX, 40 - win.el.offsetWidth), desktop.clientWidth - 40);
        const y = Math.min(Math.max(ev.clientY - offsetY, 0), desktop.clientHeight - bar.offsetHeight);
        win.el.style.left = `${x}px`;
        win.el.style.top = `${y}px`;
      };
      const stop = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', stop);
        bar.removeEventListener('pointercancel', stop);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', stop);
      bar.addEventListener('pointercancel', stop);
    });
  }

  // Pull windows back on screen if the browser window shrinks
  window.addEventListener('resize', () => {
    windows.forEach(({ el }) => {
      if (el.hidden) return;
      el.style.left = `${Math.max(0, Math.min(el.offsetLeft, desktop.clientWidth - el.offsetWidth))}px`;
      el.style.top = `${Math.max(0, Math.min(el.offsetTop, desktop.clientHeight - el.offsetHeight))}px`;
    });
  });

  function setHash(id) {
    history.replaceState(null, '', id ? `#${id}` : location.pathname + location.search);
  }

  // ---------- Icons ----------
  // Mouse: click selects, double-click opens (like the real thing).
  // Touch, pen and keyboard: a single activation opens.

  let lastPointer = 'mouse';

  function activateIcon(icon) {
    if (icon.dataset.open) openWindow(icon.dataset.open);
    else if (icon.href) window.open(icon.href, '_blank', 'noopener');
  }

  function selectIcon(icon) {
    document.querySelectorAll('.icon.selected').forEach(i => i.classList.remove('selected'));
    icon.classList.add('selected');
    const status = icon.closest('.window')?.querySelector('.status-bar > :first-child');
    if (status && icon.dataset.status) status.textContent = icon.dataset.status;
  }

  document.querySelectorAll('.icon').forEach(icon => {
    icon.addEventListener('pointerdown', e => { lastPointer = e.pointerType; });
    icon.addEventListener('click', e => {
      e.preventDefault();
      selectIcon(icon);
      if (e.detail === 0 || lastPointer !== 'mouse') activateIcon(icon);
    });
    icon.addEventListener('dblclick', () => activateIcon(icon));
  });

  desktop.addEventListener('pointerdown', e => {
    if (!e.target.closest('.icon')) {
      document.querySelectorAll('.icon.selected').forEach(i => i.classList.remove('selected'));
    }
  });

  // ---------- Buttons and links that open / close windows ----------

  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open]:not(.icon)');
    if (opener) {
      e.preventDefault();
      closeStartMenu();
      openWindow(opener.dataset.open);
      return;
    }
    const closer = e.target.closest('[data-close]');
    if (closer) closeWindow(closer.closest('.window').id);
  });

  window.addEventListener('hashchange', () => openWindow(location.hash.slice(1)));

  // ---------- Start menu ----------

  function closeStartMenu() {
    startMenu.hidden = true;
    startButton.setAttribute('aria-expanded', 'false');
  }

  startButton.addEventListener('click', () => {
    const opening = startMenu.hidden;
    startMenu.hidden = !opening;
    startButton.setAttribute('aria-expanded', String(opening));
    if (opening) startMenu.querySelector('a, button').focus();
  });

  startMenu.addEventListener('click', e => {
    if (e.target.closest('a')) closeStartMenu();
  });

  document.addEventListener('pointerdown', e => {
    if (!startMenu.hidden && !e.target.closest('#start-menu, #start-button')) closeStartMenu();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !startMenu.hidden) {
      closeStartMenu();
      startButton.focus();
    }
  });

  // ---------- Shut down ----------

  document.querySelector('[data-action="shutdown"]').addEventListener('click', () => {
    closeStartMenu();
    windows.forEach((_, id) => closeWindow(id));
    shutdownScreen.hidden = false;
    shutdownScreen.focus();
  });

  const restart = () => {
    shutdownScreen.hidden = true;
    openWindow('welcome');
  };
  shutdownScreen.addEventListener('click', restart);
  shutdownScreen.addEventListener('keydown', restart);

  // ---------- Theme ----------
  // The tray moon and the Start menu item both toggle it; the choice is remembered.

  const themeToggle = document.getElementById('theme-toggle');
  const themeMenuLabel = document.getElementById('theme-menu-label');

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    themeMenuLabel.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }

  applyTheme(document.documentElement.dataset.theme);
  document.querySelectorAll('[data-action="theme"]').forEach(btn => btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.set('theme', next);
    closeStartMenu();
  }));

  // ---------- Tabs ----------

  document.querySelectorAll('[role="tablist"]').forEach(list => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = tab => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      tab.focus();
    };
    list.addEventListener('click', e => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) select(tab);
    });
    list.addEventListener('keydown', e => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const i = tabs.indexOf(document.activeElement);
      select(tabs[(i + step + tabs.length) % tabs.length]);
    });
  });

  // ---------- Clock ----------

  const clock = document.getElementById('clock');
  const tick = () => {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    clock.title = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };
  tick();
  setInterval(tick, 10000);

  // ---------- Welcome screen preference ----------

  const showWelcome = document.getElementById('show-welcome');
  showWelcome.checked = store.get('hideWelcome') !== '1';
  showWelcome.addEventListener('change', () => store.set('hideWelcome', showWelcome.checked ? '0' : '1'));

  // ---------- Start up ----------

  document.querySelectorAll('.window').forEach(buildWindow);

  const linked = location.hash.slice(1);
  if (windows.has(linked)) openWindow(linked);
  else if (store.get('hideWelcome') !== '1') openWindow('welcome');
})();
