// Portfolio 98 - window manager, explorer, menus, start menu, taskbar and clock.
(() => {
  'use strict';

  const desktop = document.getElementById('desktop');
  const desktopIcons = document.querySelector('.desktop-icons');
  const taskList = document.getElementById('task-list');
  const startButton = document.getElementById('start-button');
  const startMenu = document.getElementById('start-menu');
  const shutdownScreen = document.getElementById('shutdown-screen');
  const smallScreen = matchMedia('(max-width: 700px)');

  const windows = new Map(); // id -> { el, task, placed, explorer? }
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

  // Changes a window's title (and icon) everywhere it shows: title bar, taskbar, screen readers
  function setWindowTitle(win, title, icon) {
    win.el.dataset.title = title;
    win.el.setAttribute('aria-label', title);
    win.el.querySelector('.title-text').textContent = title;
    if (win.task) win.task.querySelector('span').textContent = title;
    if (icon) {
      win.el.dataset.icon = icon;
      win.el.querySelector('.title-icon')?.setAttribute('src', icon);
      win.task?.querySelector('img')?.setAttribute('src', icon);
    }
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
    // Opening a folder window from the desktop or Start menu always shows its own folder
    if (win.explorer && win.explorer.path !== win.explorer.home) navigate(win, win.explorer.home);
    restoreWindow(win);
    // Dialogs (welcome, about this site) don't get their own link
    if (!win.el.classList.contains('dialog')) setHash(id);
  }

  // Brings back a minimized window without resetting anything (used by the taskbar)
  function restoreWindow(win) {
    if (win.el.classList.contains('minimized')) messageFrames(win, 'resume');
    win.el.classList.remove('minimized');
    focusWindow(win.el.id);
  }

  function closeWindow(id) {
    const win = windows.get(id);
    if (!win || win.el.hidden) return;
    if (openMenu?.win === win) closeMenu();
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
    if (openMenu?.win === win) closeMenu();
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

  const activeWindow = () => [...windows.values()].find(w => w.el.classList.contains('active') && !w.el.hidden);

  // Clicks inside an iframe never reach this page; the page losing focus to it is the only sign
  window.addEventListener('blur', () => {
    closeMenu();
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
      else restoreWindow(win);
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
    closeMenu();
    windows.forEach(({ el }) => {
      if (el.hidden) return;
      el.style.left = `${Math.max(0, Math.min(el.offsetLeft, desktop.clientWidth - el.offsetWidth))}px`;
      el.style.top = `${Math.max(0, Math.min(el.offsetTop, desktop.clientHeight - el.offsetHeight))}px`;
    });
  });

  function setHash(id) {
    history.replaceState(null, '', id ? `#${id}` : location.pathname + location.search);
  }

  // ---------- Message box ----------

  function showMessage(title, text, icon = 'error') {
    const win = windows.get('msgbox');
    document.getElementById('msgbox-text').textContent = text;
    document.getElementById('msgbox-icon').src = `icons/${icon}.png`;
    setWindowTitle(win, title);
    win.placed = false; // centre it again every time
    closeWindow('msgbox');
    openWindow('msgbox');
    win.el.querySelector('[data-close]').focus();
  }

  // ---------- Icons ----------
  // Mouse: click selects (Ctrl+click adds to the selection), double-click opens, like the real thing.
  // Touch, pen and keyboard: a single activation opens.

  let lastPointer = 'mouse';

  const iconName = icon => icon.querySelector('span').textContent;
  const winOf = node => windows.get(node.closest?.('.window')?.id);

  function activateIcon(icon, explorerWin = winOf(icon)) {
    if (explorerWin?.explorer) {
      // Inside an explorer window, folders open in place
      const folderWin = icon.dataset.open && windows.get(icon.dataset.open);
      const path = icon.dataset.goto || folderWin?.explorer?.home;
      if (path) return navigate(explorerWin, path);
    }
    if (icon.dataset.open) openWindow(icon.dataset.open);
    else if (icon.href) window.open(icon.href, '_blank', 'noopener');
  }

  function clearSelection(container) {
    container.querySelectorAll('.icon.selected').forEach(i => i.classList.remove('selected'));
  }

  function selectIcon(icon, add = false) {
    if (add) icon.classList.toggle('selected');
    else {
      clearSelection(icon.parentElement);
      icon.classList.add('selected');
    }
    const win = winOf(icon);
    if (win?.explorer) updateStatus(win);
  }

  document.addEventListener('pointerdown', e => {
    if (e.target.closest('.icon')) lastPointer = e.pointerType;
  }, true);

  document.addEventListener('click', e => {
    const icon = e.target.closest('.icon');
    if (!icon) return;
    e.preventDefault();
    selectIcon(icon, (e.ctrlKey || e.metaKey) && lastPointer === 'mouse');
    if (e.detail === 0 || lastPointer !== 'mouse') activateIcon(icon);
  });

  document.addEventListener('dblclick', e => {
    const icon = e.target.closest('.icon');
    if (icon) activateIcon(icon);
  });

  // Clicking empty space clears the selection where you clicked
  desktop.addEventListener('pointerdown', e => {
    if (e.target.closest('.icon')) return;
    const view = e.target.closest('.explorer-view');
    if (view) {
      clearSelection(view);
      updateStatus(winOf(view));
    } else if (!e.target.closest('.window')) {
      clearSelection(desktopIcons);
    }
  });

  // ---------- Explorer: a tiny C: drive ----------
  // C:\ holds Desktop, which shows the desktop icons. Windows with a data-path (My Projects, Recycle Bin)
  // are folders inside it, and their contents are the icons written in their HTML.

  const folders = new Map(); // lowercase path -> { path, title, icon, items }
  const ROOT = 'C:\\';

  // "c:/desktop/my projects/" -> "C:\Desktop\My Projects" (paths without a drive are taken from C:\)
  function normalizePath(input) {
    let path = input.trim().replace(/\//g, '\\').replace(/\\+/g, '\\');
    if (!/^[a-z]:/i.test(path)) path = ROOT + path.replace(/^\\/, '');
    path = path[0].toUpperCase() + path.slice(1);
    if (path.length === 2) path += '\\';
    return path.length > 3 ? path.replace(/\\$/, '') : path;
  }

  const folderAt = path => folders.get(normalizePath(path).toLowerCase());
  const parentOf = path => (path === ROOT ? null : normalizePath(path.slice(0, path.lastIndexOf('\\'))));
  const childPath = (folder, name) => (folder === ROOT ? ROOT + name : `${folder}\\${name}`);

  function addFolder(path, title, icon, items) {
    folders.set(path.toLowerCase(), { path, title, icon, items });
  }

  function makeFolderIcon(name, path) {
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'icon';
    icon.dataset.goto = path;
    icon.innerHTML = '<img src="icons/folder.png" alt=""><span></span>';
    icon.querySelector('span').textContent = name;
    return icon;
  }

  // Every path that exists, for the address bar's suggestions
  function fillPathSuggestions() {
    const list = document.getElementById('explorer-paths');
    const paths = [];
    folders.forEach(folder => {
      paths.push(folder.path);
      folder.items.forEach(item => {
        const isFolder = item.dataset.goto || windows.get(item.dataset.open)?.explorer;
        if (!isFolder) paths.push(childPath(folder.path, iconName(item)));
      });
    });
    list.replaceChildren(...paths.map(path => Object.assign(document.createElement('option'), { value: path })));
  }

  const ARROWS = {
    back: '<path d="M1 8l6-6v4h8v4H7v4z"/>',
    forward: '<path d="M15 8L9 2v4H1v4h8v4z"/>',
    up: '<path d="M8 1l6 6h-4v8H6V7H2z"/>',
  };

  function buildExplorer(win) {
    const { el } = win;
    const view = el.querySelector('.explorer-view');
    const items = [...view.querySelectorAll(':scope > .icon')];
    view.replaceChildren();

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    for (const [action, label] of [['back', 'Back'], ['forward', 'Forward'], ['up', 'Up']]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tool-button';
      btn.dataset.nav = action;
      btn.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${ARROWS[action]}</svg><span>${label}</span>`;
      toolbar.append(btn);
    }

    const addressBar = document.createElement('div');
    addressBar.className = 'address-bar';
    addressBar.innerHTML =
      `<label for="address-${el.id}">Address</label>` +
      `<input type="text" class="address-input" id="address-${el.id}" list="explorer-paths" autocomplete="off" spellcheck="false">` +
      '<button type="button" class="tool-button go-button">Go</button>';
    const address = addressBar.querySelector('input');

    el.querySelector('.title-bar').after(buildMenuBar(win, explorerMenus(win)), toolbar, addressBar);

    win.explorer = {
      home: normalizePath(el.dataset.path),
      path: null,
      history: [],
      index: -1,
      view,
      address,
      toolbar,
      statusBar: el.querySelector('.status-bar'),
    };
    addFolder(win.explorer.home, el.dataset.title, el.dataset.icon, items);

    toolbar.addEventListener('click', e => {
      const btn = e.target.closest('[data-nav]');
      if (!btn || btn.disabled) return;
      const ex = win.explorer;
      if (btn.dataset.nav === 'back') navigate(win, ex.history[ex.index - 1], { step: -1 });
      if (btn.dataset.nav === 'forward') navigate(win, ex.history[ex.index + 1], { step: 1 });
      if (btn.dataset.nav === 'up') navigate(win, parentOf(ex.path));
    });
    address.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        // Swallow the key so it can't also press the OK button of an error box that opens now
        e.preventDefault();
        // Let go of the box like Explorer does, so the next click selects the whole address again
        address.blur();
        goToPath(win, address.value);
      }
      if (e.key === 'Escape') {
        address.value = win.explorer.path;
        address.select();
      }
    });
    // Clicking into the box selects the whole address; stop the click's mouseup from undoing that
    let justFocused = false;
    address.addEventListener('focus', () => {
      address.select();
      justFocused = true;
    });
    address.addEventListener('mouseup', e => {
      if (justFocused) e.preventDefault();
      justFocused = false;
    });
    addressBar.querySelector('.go-button').addEventListener('click', () => goToPath(win, address.value));
  }

  // Shows a folder in an explorer window. step = -1 / 1 when moving through Back / Forward history.
  function navigate(win, path, { step = 0 } = {}) {
    const folder = folderAt(path);
    if (!folder) return;
    const ex = win.explorer;
    if (step) ex.index += step;
    else if (folder.path !== ex.path) {
      ex.history.splice(ex.index + 1, Infinity, folder.path);
      ex.index = ex.history.length - 1;
    }
    ex.path = folder.path;
    ex.address.value = folder.path;
    ex.view.replaceChildren(...folder.items.map(item => item.cloneNode(true)));
    ex.view.scrollTop = 0;
    setWindowTitle(win, folder.title, folder.icon);
    ex.toolbar.querySelector('[data-nav="back"]').disabled = ex.index <= 0;
    ex.toolbar.querySelector('[data-nav="forward"]').disabled = ex.index >= ex.history.length - 1;
    ex.toolbar.querySelector('[data-nav="up"]').disabled = ex.path === ROOT;
    updateStatus(win);
  }

  // What you type in the address bar: a folder opens here, an item opens like a double-click
  function goToPath(win, input) {
    const ex = win.explorer;
    if (!input.trim()) {
      ex.address.value = ex.path;
      return;
    }
    const path = normalizePath(input);
    if (folderAt(path)) return navigate(win, path);
    const parent = folderAt(parentOf(path) || ROOT);
    const name = path.slice(path.lastIndexOf('\\') + 1).toLowerCase();
    const item = parent?.items.find(i => {
      const label = iconName(i).toLowerCase();
      return label === name || label.replace(/\.[a-z0-9]+$/, '') === name;
    });
    ex.address.value = ex.path;
    if (item) activateIcon(item, win);
    else showMessage(path, `Cannot find '${path}'. Make sure the path is correct and try again.`);
  }

  function updateStatus(win) {
    const ex = win?.explorer;
    if (!ex) return;
    const [left, right] = ex.statusBar.children;
    const icons = ex.view.querySelectorAll('.icon');
    const selected = ex.view.querySelectorAll('.icon.selected');
    if (selected.length === 1 && selected[0].dataset.status) left.textContent = selected[0].dataset.status;
    else if (selected.length) left.textContent = `${selected.length} object(s) selected`;
    else left.textContent = `${icons.length} object(s)`;
    const folderWin = [...windows.values()].find(w => w.explorer?.home === ex.path);
    right.textContent = icons.length ? 'Double-click an item to open it' : folderWin?.el.dataset.emptyText || 'This folder is empty';
  }

  function selectAllIcons(win, invert = false) {
    win.explorer.view.querySelectorAll('.icon').forEach(i => i.classList.toggle('selected', invert ? undefined : true));
    updateStatus(win);
  }

  function setupExplorers() {
    addFolder(ROOT, '(C:)', 'icons/computer-16.png', [makeFolderIcon('Desktop', 'C:\\Desktop')]);
    addFolder('C:\\Desktop', 'Desktop', 'icons/folder-16.png', [...desktopIcons.querySelectorAll('.icon')]);
    windows.forEach(win => { if (win.el.dataset.path) buildExplorer(win); });
    windows.forEach(win => { if (win.explorer) navigate(win, win.explorer.home); });
    fillPathSuggestions();
  }

  // ---------- Menus (File, Edit, View, Help...) ----------
  // Items: { label, action, enabled(), checked(), radio, shortcut, visible() } or { separator: true }

  const menuPopup = document.createElement('div');
  menuPopup.className = 'menu-popup';
  menuPopup.setAttribute('role', 'menu');
  menuPopup.hidden = true;
  document.body.append(menuPopup);
  let openMenu = null; // { win, bar, menus, index, title }

  function buildMenuBar(win, menus) {
    const bar = document.createElement('div');
    bar.className = 'menu-bar';
    bar.setAttribute('role', 'menubar');
    bar.menus = menus;
    menus.forEach((menu, index) => {
      const title = document.createElement('button');
      title.type = 'button';
      title.className = 'menu-title';
      title.setAttribute('role', 'menuitem');
      title.setAttribute('aria-haspopup', 'true');
      title.setAttribute('aria-expanded', 'false');
      title.innerHTML = `<u>${menu.label[0]}</u>${menu.label.slice(1)}`;
      title.addEventListener('click', () => (openMenu?.title === title ? closeMenu() : showMenu(win, bar, index)));
      // Once one menu is open, pointing at another title switches to it
      title.addEventListener('pointerenter', () => { if (openMenu?.bar === bar && openMenu.index !== index) showMenu(win, bar, index); });
      title.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' && !openMenu) {
          e.preventDefault();
          showMenu(win, bar, index, true);
        }
      });
      bar.append(title);
    });
    return bar;
  }

  function showMenu(win, bar, index, focusFirst = false) {
    closeMenu();
    focusWindow(win.el.id);
    const title = bar.children[index];
    menuPopup.replaceChildren();
    for (const item of bar.menus[index].items) {
      if (item.visible && !item.visible()) continue;
      if (item.separator) {
        const line = document.createElement('div');
        line.className = 'menu-separator';
        line.setAttribute('role', 'separator');
        menuPopup.append(line);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-item';
      btn.innerHTML = '<span class="menu-check" aria-hidden="true"></span><span class="menu-label"></span><span class="menu-shortcut"></span>';
      btn.querySelector('.menu-label').textContent = item.label;
      btn.querySelector('.menu-shortcut').textContent = item.shortcut || '';
      btn.setAttribute('role', item.radio ? 'menuitemradio' : item.checked ? 'menuitemcheckbox' : 'menuitem');
      if (item.checked) {
        const on = Boolean(item.checked());
        btn.setAttribute('aria-checked', String(on));
        if (on) btn.querySelector('.menu-check').textContent = item.radio ? '•' : '✓';
      }
      const enabled = item.enabled ? item.enabled() : true;
      if (!enabled) btn.setAttribute('aria-disabled', 'true');
      btn.addEventListener('click', () => {
        if (!enabled) return;
        closeMenu();
        item.action?.();
      });
      btn.addEventListener('pointerenter', () => btn.focus({ preventScroll: true }));
      menuPopup.append(btn);
    }
    menuPopup.hidden = false;
    const rect = title.getBoundingClientRect();
    menuPopup.style.left = `${Math.max(0, Math.min(rect.left, innerWidth - menuPopup.offsetWidth - 2))}px`;
    menuPopup.style.top = `${Math.max(0, Math.min(rect.bottom, innerHeight - menuPopup.offsetHeight - 2))}px`;
    title.classList.add('open');
    title.setAttribute('aria-expanded', 'true');
    openMenu = { win, bar, index, title };
    if (focusFirst) menuItems()[0]?.focus();
  }

  function closeMenu() {
    if (!openMenu) return;
    openMenu.title.classList.remove('open');
    openMenu.title.setAttribute('aria-expanded', 'false');
    menuPopup.hidden = true;
    openMenu = null;
  }

  const menuItems = () => [...menuPopup.querySelectorAll('.menu-item:not([aria-disabled="true"])')];

  document.addEventListener('pointerdown', e => {
    if (openMenu && !e.target.closest('.menu-popup, .menu-title')) closeMenu();
  });

  document.addEventListener('keydown', e => {
    if (openMenu) {
      const items = menuItems();
      const i = items.indexOf(document.activeElement);
      const count = openMenu.bar.menus.length;
      if (e.key === 'Escape') {
        e.preventDefault();
        const { title } = openMenu;
        closeMenu();
        title.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(i + 1) % items.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[i <= 0 ? items.length - 1 : i - 1]?.focus();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = (openMenu.index + (e.key === 'ArrowRight' ? 1 : -1) + count) % count;
        showMenu(openMenu.win, openMenu.bar, next, true);
      } else if (e.key === 'Tab') {
        closeMenu();
      }
      return;
    }
    // Alt + the underlined letter opens that menu in the active window
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
      const win = activeWindow();
      const bar = win?.el.querySelector('.menu-bar');
      const index = bar ? bar.menus.findIndex(m => m.label[0].toLowerCase() === e.key.toLowerCase()) : -1;
      if (index >= 0) {
        e.preventDefault();
        showMenu(win, bar, index, true);
      }
    }
  });

  function explorerMenus(win) {
    const selected = () => [...win.explorer.view.querySelectorAll('.icon.selected')];
    const inRecycleBin = () => win.explorer.path.toLowerCase().endsWith('\\recycle bin');
    const statusBar = () => win.explorer.statusBar;
    return [
      { label: 'File', items: [
        { label: 'Open', shortcut: 'Enter', enabled: () => selected().length > 0, action: () => selected().forEach(i => activateIcon(i, win)) },
        { separator: true, visible: inRecycleBin },
        { label: 'Empty Recycle Bin', visible: inRecycleBin, enabled: () => win.explorer.view.querySelector('.icon') !== null },
        { separator: true },
        { label: 'Close', action: () => closeWindow(win.el.id) },
      ] },
      { label: 'Edit', items: [
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => selectAllIcons(win) },
        { label: 'Invert Selection', action: () => selectAllIcons(win, true) },
      ] },
      { label: 'View', items: [
        { label: 'Large Icons', radio: true, checked: () => !win.explorer.view.classList.contains('list-view'), action: () => win.explorer.view.classList.remove('list-view') },
        { label: 'List', radio: true, checked: () => win.explorer.view.classList.contains('list-view'), action: () => win.explorer.view.classList.add('list-view') },
        { separator: true },
        { label: 'Status Bar', checked: () => !statusBar().hidden, action: () => { statusBar().hidden = !statusBar().hidden; } },
        { separator: true },
        { label: 'Up One Level', enabled: () => win.explorer.path !== ROOT, action: () => navigate(win, parentOf(win.explorer.path)) },
        { label: 'Refresh', action: () => navigate(win, win.explorer.path) },
      ] },
      { label: 'Help', items: [
        { label: 'About Portfolio 98', action: () => openWindow('about-site') },
      ] },
    ];
  }

  // ---------- Notepad ----------

  function notepadText(body) {
    const blocks = [...body.children].map(node => {
      if (node.tagName === 'H2') return `== ${node.textContent.trim().toUpperCase()} ==`;
      if (node.tagName === 'UL') return [...node.children].map(li => `- ${li.textContent.trim()}`).join('\n');
      return node.textContent.trim();
    });
    return blocks.join('\n\n') + '\n';
  }

  // "Save As": hands the visitor a file. The window title before " - " is the file name ("About Me.txt").
  function saveAs(url, win) {
    const link = document.createElement('a');
    link.href = url;
    link.download = win.el.dataset.title.split(' - ')[0];
    link.click();
  }

  function saveNotepad(win, body) {
    const blob = new Blob([notepadText(body).replace(/\n/g, '\r\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    saveAs(url, win);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function selectAllText(body) {
    const range = document.createRange();
    range.selectNodeContents(body);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }

  function selectedText(body) {
    const sel = getSelection();
    return sel.rangeCount && !sel.isCollapsed && body.contains(sel.anchorNode) ? sel.toString() : '';
  }

  function copyText(text) {
    navigator.clipboard?.writeText(text).catch(() => document.execCommand('copy'));
  }

  // Find: searches the notepad's text and selects the next match after the current selection
  const findInput = document.getElementById('find-text');
  const findCase = document.getElementById('find-case');
  let findTarget = null;
  let lastMatchEnd = 0; // where the last match ended, for when clicking into the Find box drops the selection

  function openFind(body) {
    if (findTarget !== body) lastMatchEnd = 0;
    findTarget = body;
    openWindow('find');
    findInput.focus();
    findInput.select();
  }

  function findNext() {
    const query = findInput.value;
    if (!findTarget) return;
    if (!query) return openFind(findTarget);
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(findTarget, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      nodes.push({ node: walker.currentNode, start: text.length });
      text += walker.currentNode.nodeValue;
    }
    const haystack = findCase.checked ? text : text.toLowerCase();
    const needle = findCase.checked ? query : query.toLowerCase();
    // Continue after the current selection in the notepad, or else after the last match
    let from = lastMatchEnd;
    const sel = getSelection();
    if (sel.rangeCount && findTarget.contains(sel.focusNode)) {
      const range = sel.getRangeAt(0);
      const hit = nodes.find(n => n.node === range.endContainer);
      if (hit) from = hit.start + range.endOffset;
    }
    const at = haystack.indexOf(needle, from);
    if (at < 0) return showMessage('Notepad', `Cannot find "${query}"`, 'info');
    // Turn positions in the joined text back into (text node, offset) pairs
    const locate = (pos, isEnd) => {
      for (let k = nodes.length - 1; k >= 0; k--) {
        if (isEnd ? nodes[k].start < pos : nodes[k].start <= pos) return [nodes[k].node, pos - nodes[k].start];
      }
      return [nodes[0].node, 0];
    };
    const range = document.createRange();
    range.setStart(...locate(at, false));
    range.setEnd(...locate(at + needle.length, true));
    sel.removeAllRanges();
    sel.addRange(range);
    lastMatchEnd = at + needle.length;
    range.startContainer.parentElement.scrollIntoView({ block: 'nearest' });
  }

  document.getElementById('find-next').addEventListener('click', findNext);
  findInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // so the same Enter can't press OK on a "Cannot find" box
    findNext();
  });

  function notepadMenus(win, body) {
    return [
      { label: 'File', items: [
        { label: 'Save As...', action: () => saveNotepad(win, body) },
        { separator: true },
        { label: 'Exit', action: () => closeWindow(win.el.id) },
      ] },
      { label: 'Edit', items: [
        { label: 'Copy', shortcut: 'Ctrl+C', enabled: () => selectedText(body) !== '', action: () => copyText(selectedText(body)) },
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => selectAllText(body) },
        { separator: true },
        { label: 'Word Wrap', checked: () => !body.classList.contains('nowrap'), action: () => body.classList.toggle('nowrap') },
      ] },
      { label: 'Search', items: [
        { label: 'Find...', action: () => openFind(body) },
        { label: 'Find Next', shortcut: 'F3', action: () => { findTarget = body; findNext(); } },
      ] },
      { label: 'Help', items: [
        { label: 'About Notepad', action: () => openWindow('about-site') },
      ] },
    ];
  }

  function setupNotepads() {
    windows.forEach(win => {
      if (win.el.dataset.app !== 'notepad') return;
      const body = win.el.querySelector('.notepad');
      win.notepad = body;
      win.el.querySelector('.title-bar').after(buildMenuBar(win, notepadMenus(win, body)));
    });
  }

  // ---------- Paint (the photo viewer) ----------
  // The tool box and color box are for looks; the menus work.

  const PAINT_TOOLS = [
    '<path d="M3 4l5-2 5 3-1 6-6 2-3-4z" fill="none" stroke="currentColor" stroke-dasharray="2 1"/>', // free-form select
    '<rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="currentColor" stroke-dasharray="2 1"/>', // select
    '<path d="M3 10l6-6 4 4-6 6H3z" fill="#f2b8c6" stroke="currentColor"/>', // eraser
    '<path d="M4 7l4-4 5 5-4 4z" fill="#fff" stroke="currentColor"/><path d="M12 9.5c1 1.5 1 3 0 3.5" fill="none" stroke="#00f" stroke-width="1.5"/>', // fill
    '<path d="M3 14l6-6 2 2-6 6H3zM9 5l3-3 2 2-3 3z" fill="currentColor"/>', // pick color
    '<circle cx="6.5" cy="6.5" r="4" fill="#cff" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 9.5l4 4" stroke="currentColor" stroke-width="2"/>', // magnifier
    '<path d="M3 13l1-3 7-7 2 2-7 7z" fill="#fc0" stroke="currentColor"/>', // pencil
    '<path d="M9 2l4 4-3 3-4-4z" fill="#963" stroke="currentColor"/><path d="M6 6l-3 3c-1 1-1 4 1 4s3-1 4-3z" fill="currentColor"/>', // brush
    '<path d="M2 8h5v6H2z" fill="currentColor"/><path d="M9 4h1v1H9zm3 1h1v1h-1zm-2 3h1v1h-1zm3 2h1v1h-1zm-3 2h1v1h-1z" fill="currentColor"/>', // airbrush
    '<text x="8" y="13" text-anchor="middle" font-family="Times New Roman, serif" font-weight="bold" font-size="13" fill="currentColor">A</text>', // text
    '<path d="M2 13L14 3" stroke="currentColor" stroke-width="1.5"/>', // line
    '<path d="M2 12c3-10 9 2 12-8" fill="none" stroke="currentColor" stroke-width="1.5"/>', // curve
    '<rect x="2.5" y="4.5" width="11" height="8" fill="none" stroke="currentColor"/>', // rectangle
    '<path d="M2.5 12.5l2-8 5 3 4-4v9z" fill="none" stroke="currentColor"/>', // polygon
    '<ellipse cx="8" cy="8.5" rx="6" ry="4.5" fill="none" stroke="currentColor"/>', // ellipse
    '<rect x="2.5" y="4.5" width="11" height="8" rx="3" fill="none" stroke="currentColor"/>', // rounded rectangle
  ];
  const PAINT_PENCIL = 6;
  // The default Windows 98 Paint palette
  const PAINT_COLORS = [
    '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
    '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
  ];

  function setupPaints() {
    windows.forEach(win => {
      if (win.el.dataset.app !== 'paint') return;
      const tools = win.el.querySelector('.paint-tools');
      const colors = win.el.querySelector('.paint-colors');
      const statusBar = win.el.querySelector('.status-bar');
      const image = win.el.querySelector('.paint-image');
      tools.innerHTML = PAINT_TOOLS.map((svg, i) =>
        `<span class="paint-tool${i === PAINT_PENCIL ? ' pressed' : ''}"><svg viewBox="0 0 16 16">${svg}</svg></span>`).join('');
      colors.innerHTML = '<span class="paint-current"><span class="paint-fg"></span><span class="paint-bg"></span></span>' +
        `<span class="paint-palette">${PAINT_COLORS.map(c => `<span style="background: ${c}"></span>`).join('')}</span>`;

      let flipX = 1;
      let flipY = 1;
      const applyFlip = () => {
        image.style.setProperty('--flip-x', flipX);
        image.style.setProperty('--flip-y', flipY);
      };
      const toggle = el => () => { el.hidden = !el.hidden; };
      const large = () => image.classList.contains('large');

      win.el.querySelector('.title-bar').after(buildMenuBar(win, [
        { label: 'File', items: [
          { label: 'Save As...', action: () => saveAs(image.currentSrc || image.src, win) },
          { separator: true },
          { label: 'Exit', action: () => closeWindow(win.el.id) },
        ] },
        { label: 'View', items: [
          { label: 'Tool Box', checked: () => !tools.hidden, action: toggle(tools) },
          { label: 'Color Box', checked: () => !colors.hidden, action: toggle(colors) },
          { label: 'Status Bar', checked: () => !statusBar.hidden, action: toggle(statusBar) },
          { separator: true },
          { label: 'Normal Size', radio: true, checked: () => !large(), action: () => image.classList.remove('large') },
          { label: 'Large Size', radio: true, checked: large, action: () => image.classList.add('large') },
        ] },
        { label: 'Image', items: [
          { label: 'Flip Horizontal', action: () => { flipX *= -1; applyFlip(); } },
          { label: 'Flip Vertical', action: () => { flipY *= -1; applyFlip(); } },
          { label: 'Invert Colors', action: () => image.classList.toggle('inverted') },
        ] },
        { label: 'Help', items: [
          { label: 'About Paint', action: () => openWindow('about-site') },
        ] },
      ]));
    });
  }

  // Keyboard shortcuts inside explorer and notepad windows (Ctrl+A, F3), and Esc for message boxes
  document.addEventListener('keydown', e => {
    const win = activeWindow();
    if (!win || openMenu) return;
    const typing = e.target.matches('input, textarea');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing) {
      if (win.explorer) {
        e.preventDefault();
        selectAllIcons(win);
      } else if (win.notepad) {
        e.preventDefault();
        selectAllText(win.notepad);
      }
    } else if (e.key === 'F3' && win.notepad) {
      e.preventDefault();
      findTarget = win.notepad;
      findNext();
    } else if (e.key === 'Escape' && (win.el.id === 'msgbox' || win.el.id === 'find')) {
      closeWindow(win.el.id);
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

  // ---------- Live data ----------

  function setProgress(bar, percent) {
    bar.setAttribute('aria-valuenow', String(percent));
    bar.querySelector('span').style.width = `${percent}%`;
  }

  // Progress bars with data-start / data-end (like the degree) fill themselves from today's date
  document.querySelectorAll('.progress[data-start][data-end]').forEach(bar => {
    const start = Date.parse(bar.dataset.start);
    const end = Date.parse(bar.dataset.end);
    const percent = Math.round(Math.min(1, Math.max(0, (Date.now() - start) / (end - start))) * 100);
    setProgress(bar, percent);
    const label = document.getElementById(bar.dataset.percentLabel);
    if (label) label.textContent = percent;
  });

  const formatDate = (iso, month) => new Date(`${iso}T00:00:00`).toLocaleDateString('en', { year: 'numeric', month, day: 'numeric' });

  function showRepos(repos) {
    const list = document.getElementById('recent-repos');
    list.replaceChildren(...repos.map(repo => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = repo.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = repo.name;
      const meta = document.createElement('span');
      meta.className = 'repo-meta';
      meta.textContent = ` · ${[repo.language, formatDate(repo.pushed, 'short')].filter(Boolean).join(' · ')}`;
      item.append(link, meta);
      if (repo.description) {
        const desc = document.createElement('span');
        desc.className = 'repo-desc';
        desc.textContent = repo.description;
        item.append(desc);
      }
      return item;
    }));
  }

  // GitHub data is fetched live in the visitor's browser (one API call per visit; the limit is 60 an hour).
  // If that fails, data/github.json (made by scripts/update_data.py) is used, and failing that,
  // the text already in the page stays. Keep the filtering below in sync with that script.
  const GITHUB_USER = 'Si7li';
  const SITE_REPO = 'Portfolio_Win98';

  const getJson = url => fetch(url).then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))));
  const getText = url => fetch(url).then(res => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))));

  // Milestone table rows in the GyozaOS README look like "| 5–6 — Physical and virtual memory | done |"
  function parseMilestones(readme) {
    let done = 0;
    let total = 0;
    let next = null;
    for (const line of readme.split('\n')) {
      const m = line.match(/^\|\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*[—–-]+\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$/);
      if (!m) continue;
      const count = Number(m[2] || m[1]) - Number(m[1]) + 1;
      const state = m[4].trim().toLowerCase();
      total += count;
      if (state === 'done') done += count;
      else if (!next) next = { title: m[3], state };
    }
    return total ? { done, total, next } : null;
  }

  async function liveGitHubData() {
    const [repos, readme] = await Promise.all([
      getJson(`https://api.github.com/users/${GITHUB_USER}/repos?type=owner&sort=pushed&per_page=100`),
      getText(`https://raw.githubusercontent.com/${GITHUB_USER}/GyozaOS/HEAD/README.md`).catch(() => ''),
    ]);
    const site = repos.find(r => r.name === SITE_REPO);
    return {
      updated: site?.pushed_at.slice(0, 10),
      repos: repos
        .filter(r => !r.fork && !r.archived && r.name !== SITE_REPO && r.name !== GITHUB_USER)
        .slice(0, 6)
        .map(r => ({ name: r.name, url: r.html_url, description: r.description || '', language: r.language || '', pushed: r.pushed_at.slice(0, 10) })),
      gyozaos: parseMilestones(readme),
    };
  }

  liveGitHubData()
    .catch(() => getJson('data/github.json'))
    .then(data => {
      if (data.gyozaos) {
        const { done, total, next } = data.gyozaos;
        setProgress(document.getElementById('gyozaos-progress'), Math.round((done / total) * 100));
        document.getElementById('gyozaos-caption').textContent =
          `${done} of ${total} milestones done` + (next ? ` - next up: ${next.title}` : ' - all milestones done!');
      }
      if (data.repos?.length) showRepos(data.repos);
      if (data.updated) document.getElementById('data-updated').textContent = formatDate(data.updated, 'long');
    })
    .catch(() => { /* keep the built-in text */ });

  // ---------- Welcome screen preference ----------

  const showWelcome = document.getElementById('show-welcome');
  showWelcome.checked = store.get('hideWelcome') !== '1';
  showWelcome.addEventListener('change', () => store.set('hideWelcome', showWelcome.checked ? '0' : '1'));

  // ---------- Start up ----------

  document.querySelectorAll('.window').forEach(buildWindow);
  setupExplorers();
  setupNotepads();
  setupPaints();

  const linked = location.hash.slice(1);
  if (windows.has(linked)) openWindow(linked);
  else if (store.get('hideWelcome') !== '1') openWindow('welcome');
})();
