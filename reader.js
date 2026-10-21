// Reader for Portfolio 98: shows a PDF (the resume) inside a window, rendered sharp at any zoom
// by PDF.js (vendor/pdfjs). script.js calls Reader98.setup(win, api) for the window marked
// data-app="reader" and gets back { open(), onKey(event) }. PDF.js only downloads the first time
// the window opens.
window.Reader98 = (() => {
  'use strict';

  const PDFJS = 'vendor/pdfjs/pdf.min.mjs';
  const WORKER = 'vendor/pdfjs/pdf.worker.min.mjs';
  const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]; // 1 = 100%
  const PAGE_GAP = 12;

  let pdfjs = null;
  const loadPdfjs = () => {
    pdfjs ||= import(new URL(PDFJS, document.baseURI).href).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL(WORKER, document.baseURI).href;
      return lib;
    });
    return pdfjs;
  };

  const ICONS = {
    save: '<path d="M2 2h10l2 2v10H2z" fill="#2850b8" stroke="currentColor"/><path d="M4 2h7v4H4z" fill="#c0c0c0"/><path d="M4 9h8v5H4z" fill="#fff"/>',
    print: '<path d="M4 2h8v4H4z" fill="#fff" stroke="currentColor"/><path d="M1 6h14v6H1z" fill="#c0c0c0" stroke="currentColor"/><path d="M4 10h8v4H4z" fill="#fff" stroke="currentColor"/>',
    out: '<circle cx="6.5" cy="6.5" r="4.5" fill="#cff" stroke="currentColor" stroke-width="1.5"/><path d="M10 10l4 4" stroke="currentColor" stroke-width="2"/><path d="M4 6.5h5" stroke="currentColor" stroke-width="1.5"/>',
    in: '<circle cx="6.5" cy="6.5" r="4.5" fill="#cff" stroke="currentColor" stroke-width="1.5"/><path d="M10 10l4 4" stroke="currentColor" stroke-width="2"/><path d="M4 6.5h5M6.5 4v5" stroke="currentColor" stroke-width="1.5"/>',
    fit: '<path d="M1 3h14v10H1z" fill="#fff" stroke="currentColor"/><path d="M3 8h10M3 8l2-2M3 8l2 2M13 8l-2-2M13 8l-2 2" stroke="currentColor" fill="none"/>',
  };

  function setup(win, api) {
    const el = win.el;
    const src = el.dataset.src;
    const fileName = src.split('/').pop();
    const view = el.querySelector('.reader-view');
    const pagesBox = el.querySelector('.reader-pages');
    const [statusLeft, statusRight] = el.querySelector('.status-bar').children;

    let doc = null;
    let loading = null;
    let fit = true;
    let zoom = 1;
    let renderToken = 0;
    let lastWidth = 0;

    // ---------- Toolbar and menus ----------

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar reader-toolbar';
    const toolButton = (act, label, showLabel) =>
      `<button type="button" class="tool-button" data-act="${act}" aria-label="${label}" title="${label}">` +
      `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[act]}</svg>${showLabel ? `<span>${label}</span>` : ''}</button>`;
    toolbar.innerHTML =
      toolButton('save', 'Save a Copy', true) + toolButton('print', 'Print', true) +
      '<span class="toolbar-sep" aria-hidden="true"></span>' +
      toolButton('out', 'Zoom Out') + '<span class="reader-zoom" aria-live="polite">100%</span>' + toolButton('in', 'Zoom In') +
      toolButton('fit', 'Fit Width', true) +
      '<span class="toolbar-sep" aria-hidden="true"></span><span class="reader-page-count"></span>';
    const zoomLabel = toolbar.querySelector('.reader-zoom');
    const pageCount = toolbar.querySelector('.reader-page-count');

    const saveCopy = () => api.saveAs(src, fileName);
    const openInBrowser = () => window.open(src, '_blank', 'noopener');

    // Print the real PDF through the browser; fall back to opening it in a new tab
    function print() {
      const frame = document.createElement('iframe');
      frame.className = 'reader-print-frame';
      frame.src = src;
      frame.addEventListener('load', () => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        } catch {
          openInBrowser();
        }
        setTimeout(() => frame.remove(), 60000);
      });
      document.body.append(frame);
    }

    toolbar.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'save') saveCopy();
      if (act === 'print') print();
      if (act === 'out') stepZoom(-1);
      if (act === 'in') stepZoom(1);
      if (act === 'fit') fitWidth();
    });

    el.querySelector('.title-bar').after(api.buildMenuBar(win, [
      { label: 'File', items: [
        { label: 'Save a Copy...', action: saveCopy },
        { label: 'Open in New Window', action: openInBrowser },
        { label: 'Print...', shortcut: 'Ctrl+P', action: print },
        { separator: true },
        { label: 'Exit', action: () => api.closeWindow(el.id) },
      ] },
      { label: 'View', items: [
        { label: 'Zoom In', shortcut: 'Ctrl++', enabled: () => !!doc, action: () => stepZoom(1) },
        { label: 'Zoom Out', shortcut: 'Ctrl+-', enabled: () => !!doc, action: () => stepZoom(-1) },
        { separator: true },
        { label: 'Actual Size', radio: true, checked: () => !fit && zoom === 1, enabled: () => !!doc, action: () => setZoom(1) },
        { label: 'Fit Width', radio: true, checked: () => fit, enabled: () => !!doc, action: fitWidth },
      ] },
      { label: 'Help', items: [
        { label: 'About Reader', action: () => api.openWindow('about-site') },
      ] },
    ]), toolbar);

    // ---------- Zoom ----------

    function setZoom(z) {
      fit = false;
      zoom = z;
      render();
    }

    function fitWidth() {
      fit = true;
      render();
    }

    function stepZoom(direction) {
      if (!doc) return;
      const next = direction > 0 ? ZOOMS.find(z => z > zoom + 0.01) : [...ZOOMS].reverse().find(z => z < zoom - 0.01);
      if (next) setZoom(next);
    }

    // ---------- Loading and drawing ----------

    function showError() {
      pagesBox.innerHTML =
        '<div class="reader-error"><img src="icons/error.png" alt="" width="32" height="32">' +
        '<p>The resume can\'t be shown here, but you can still get it:</p>' +
        '<div class="button-row"><button type="button" class="button" data-act="save">Save a Copy</button>' +
        '<button type="button" class="button" data-act="browser">Open in Browser</button></div></div>';
      pagesBox.querySelector('[data-act="save"]').addEventListener('click', saveCopy);
      pagesBox.querySelector('[data-act="browser"]').addEventListener('click', openInBrowser);
      statusLeft.textContent = 'Could not open the document';
      api.playError?.();
    }

    function open() {
      if (!loading) {
        statusLeft.textContent = `Opening ${fileName}...`;
        loading = loadPdfjs()
          .then(lib => lib.getDocument({ url: new URL(src, document.baseURI).href }).promise)
          .then(pdf => {
            doc = pdf;
            pageCount.textContent = `${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
            return render();
          })
          .catch(err => {
            console.error(err);
            showError();
          });
      } else if (doc && fit && Math.abs(view.clientWidth - lastWidth) > 2) {
        render(); // the window may have been resized while it was closed
      }
      return loading;
    }

    async function render() {
      if (!doc) return;
      const token = ++renderToken;
      const lib = await loadPdfjs();
      const cssUnits = lib.PixelsPerInch.PDF_TO_CSS_UNITS;
      const first = await doc.getPage(1);
      const base = first.getViewport({ scale: cssUnits });
      lastWidth = view.clientWidth;
      if (fit) zoom = Math.max(0.25, (view.clientWidth - 2 * PAGE_GAP) / base.width);
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      const ratio = window.devicePixelRatio || 1;
      const sheets = [];

      for (let n = 1; n <= doc.numPages; n++) {
        const page = n === 1 ? first : await doc.getPage(n);
        const viewport = page.getViewport({ scale: zoom * cssUnits });
        const sheet = document.createElement('div');
        sheet.className = 'reader-sheet';
        sheet.style.width = `${Math.floor(viewport.width)}px`;
        sheet.style.height = `${Math.floor(viewport.height)}px`;

        // The page itself, drawn at the screen's real pixel density so text stays crisp
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        await page.render({ canvas, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] }).promise;
        if (token !== renderToken) return;
        sheet.append(canvas);

        // Invisible text on top, so it can be selected and copied
        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';
        textLayer.style.setProperty('--total-scale-factor', String(viewport.scale));
        textLayer.style.setProperty('--scale-factor', String(viewport.scale));
        sheet.append(textLayer);
        await new lib.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport }).render();

        // Clickable links (e-mail, LinkedIn, GitHub)
        for (const annotation of await page.getAnnotations()) {
          if (annotation.subtype !== 'Link' || !annotation.url) continue;
          const [ax, ay] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
          const [bx, by] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
          const [x1, x2, y1, y2] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by), Math.max(ay, by)];
          const link = document.createElement('a');
          link.className = 'reader-link';
          link.href = annotation.url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.title = annotation.url;
          link.setAttribute('aria-label', annotation.url);
          Object.assign(link.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
          sheet.append(link);
        }
        sheets.push(sheet);
      }
      if (token !== renderToken) return;
      pagesBox.replaceChildren(...sheets);
      statusLeft.textContent = fit ? 'Fit Width' : `Zoom ${Math.round(zoom * 100)}%`;
      statusRight.textContent = fileName;
    }

    // Re-fit when the window changes width (maximize, phone rotation, browser resize)
    let resizeTimer = null;
    new ResizeObserver(() => {
      if (!doc || !fit || el.hidden || Math.abs(view.clientWidth - lastWidth) <= 2) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 150);
    }).observe(view);

    // Ctrl + / Ctrl - zoom the document instead of the whole page; Ctrl+P prints it
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey)) return false;
      if (e.key === '+' || e.key === '=') stepZoom(1);
      else if (e.key === '-') stepZoom(-1);
      else if (e.key === '0') setZoom(1);
      else if (e.key.toLowerCase() === 'p') print();
      else return false;
      return true;
    }

    statusLeft.textContent = '';
    statusRight.textContent = fileName;
    return { open, onKey };
  }

  return { setup };
})();
