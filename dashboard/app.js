(function () {
  'use strict';

  var root = document.getElementById('app'), State = window.RadarState, UI = window.RadarComponents;
  if (!root || !State.getData()) {
    if (root) root.textContent = 'Radar data unavailable.';
    return;
  }

  var headerCountUpStarted = false;

  function countHeaderStats() {
    if (headerCountUpStarted) return;
    headerCountUpStarted = true;
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    Array.prototype.forEach.call(root.querySelectorAll('.metrics .metric b'), function (node) {
      var original = node.textContent, finalValue = /^\d+$/.test(original) ? Number(original) : null;
      if (finalValue === null || !isFinite(finalValue)) return;
      var started = null;
      node.textContent = '0';
      function frame(now) {
        if (started === null) started = now;
        var progress = Math.min(1, (now - started) / 800), eased = 1 - Math.pow(1 - progress, 3);
        node.textContent = String(Math.round(finalValue * eased));
        if (progress < 1) window.requestAnimationFrame(frame);
        else node.textContent = original;
      }
      window.requestAnimationFrame(frame);
    });
  }

  var page, shortlistRegion, boardRegion, detailRegion;
  // The element that opened the detail, and the region it lives in: a protocol can appear in both the shortlist and the board.
  var opener = null, openerRegion = null;

  function mount() {
    var v = State.compute(), d = v.data;
    page = document.createElement('div');
    // Entrance animations are scoped to .is-entering, which only the initial mount carries.
    page.className = 'page is-entering';
    shortlistRegion = document.createElement('div');
    shortlistRegion.dataset.results = 'shortlist';
    shortlistRegion.appendChild(UI.shortlist(v));
    boardRegion = UI.board(v);
    detailRegion = document.createElement('div');
    detailRegion.dataset.results = 'detail';
    page.append(UI.header(d), shortlistRegion, UI.curve(v), boardRegion, detailRegion);
    page.append(UI.chart(v), UI.method(d), UI.live(d));
    var note = document.createElement('aside');
    note.className = 'fixed-note';
    note.textContent = 'Model estimates, not prices.';
    page.appendChild(note);
    root.replaceChildren(page);
    countHeaderStats();
  }

  // Rebuilds the board rows for a search, filter or sort change. UI.board already built them once for the initial mount.
  function renderBoard() {
    page.classList.remove('is-entering');
    UI.updateBoardResults(boardRegion.querySelector('[data-results="board"]'), State.compute());
  }

  // Opening and closing the detail leaves the board alone, so the opener element survives to take focus back.
  function renderDetail() {
    var v = State.compute();
    detailRegion.replaceChildren();
    if (v.selected) {
      var detail = UI.detail(v.data, v.selected);
      if (detail) detailRegion.appendChild(detail);
    }
  }

  function openDetail(source) {
    opener = source;
    openerRegion = source.closest('[data-results]');
    State.update({ selected: source.dataset.slug });
    renderDetail();
    var detail = detailRegion.querySelector('.detail');
    if (detail) detail.scrollIntoView({ block: 'nearest' });
  }

  function closeDetail() {
    var slug = State.getState().selected;
    if (!slug) return;
    State.update({ selected: null });
    renderDetail();
    // Back to the element that opened it. If the board was re-rendered meanwhile, the same protocol's row in the same
    // region stands in; focusing it also scrolls it back into view.
    var target = opener && opener.isConnected ? opener : openerRegion && openerRegion.isConnected ? openerRegion.querySelector('[data-slug="' + slug + '"]') : null;
    if (target) target.focus();
    opener = openerRegion = null;
  }

  // One listener: text inputs, selects and checkboxes all fire 'input'.
  root.addEventListener('input', function (e) {
    var f = e.target.dataset.filter;
    if (f) {
      var p = {};
      p[f] = f === 'watchlist' ? e.target.checked : e.target.value;
      State.update(p);
      renderBoard();
    }
  });

  root.addEventListener('click', function (e) {
    // An info tip is its own control: interacting with it never sorts, opens or closes anything.
    if (e.target.closest('.info-tip')) return;
    var sort = e.target.closest('[data-sort]'), close = e.target.closest('[data-close]');
    if (sort) {
      var key = sort.dataset.sort;
      State.sortBy(key);
      renderBoard();
      var sortedHeader = root.querySelector('[data-sort="' + key + '"]');
      if (sortedHeader) sortedHeader.focus();
    } else if (close) {
      closeDetail();
    } else {
      var row = e.target.closest('[data-slug]');
      if (row) openDetail(row);
    }
  });

  root.addEventListener('keydown', function (e) {
    // Only a focused board row needs this: shortlist cards are real buttons and activate natively, and a key pressed
    // while a tip inside the row has focus belongs to the tip.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-slug]')) {
      e.preventDefault();
      openDetail(e.target);
    }
  });

  // Keeps a tip's bubble inside the page column. The bubble is laid out even while transparent, so its resting place
  // (app.css: right edge on the marker) and every place set here must stay inside the page, or the document widens.
  // Centred on the marker where that fits (.info-tip-right: ending at it), otherwise moved in by the shortfall.
  function placeTip(e) {
    var t = e.target.closest && e.target.closest('.info-tip');
    if (!t) return;
    var b = getComputedStyle(t, '::after'), p = getComputedStyle(page), box = page.getBoundingClientRect(), a = t.getBoundingClientRect();
    var w = ['width', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce(function (sum, k) { return sum + parseFloat(b[k]); }, 0);
    var min = box.left + parseFloat(p.paddingLeft), max = box.right - parseFloat(p.paddingRight) - w;
    var x = t.classList.contains('info-tip-right') ? a.right - w : a.left + (a.width - w) / 2;
    t.style.setProperty('--tip-x', Math.max(min, Math.min(x, max)) - a.left - t.clientLeft + 'px');
  }
  root.addEventListener('mouseover', placeTip);
  root.addEventListener('focusin', placeTip);
  // A placement is only good for the width it was measured at.
  window.addEventListener('resize', function () {
    Array.prototype.forEach.call(root.querySelectorAll('.info-tip[style]'), function (t) { t.style.removeProperty('--tip-x'); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && State.getState().selected) closeDetail();
  });

  mount();
}());
