(function () {
  'use strict';

  var root = document.getElementById('app'), State = window.RadarState, UI = window.RadarComponents;
  if (!root || !State.getData()) {
    if (root) root.textContent = 'Radar data unavailable.';
    return;
  }

  function countHeaderStats() {
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    root.querySelectorAll('.metrics .metric b').forEach(function (node) {
      var original = node.textContent, finalValue = /^\d+$/.test(original) ? Number(original) : null;
      if (finalValue === null) return;
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

  var html = document.documentElement, page, shortlistRegion, boardRegion, detailRegion, toTop;
  var opener, openerRegion, trail = [];
  function slugOf(r) { return r.slug; }

  function mount() {
    var v = State.compute(), d = v.data;
    document.title += ' · ' + d.model_version;
    page = document.createElement('div');
    page.className = 'page is-entering';
    shortlistRegion = document.createElement('div');
    shortlistRegion.dataset.results = 'shortlist';
    shortlistRegion.appendChild(UI.shortlist(v));
    boardRegion = UI.board(v);
    detailRegion = document.createElement('div');
    detailRegion.dataset.results = 'detail';
    var region = document.createElement('div');
    region.className = 'first-region';
    region.append(shortlistRegion, UI.curve(v));
    page.append(UI.header(d), region, boardRegion);
    page.append(UI.chart(v), UI.validation(d), UI.method(d), UI.live(d));
    var note = document.createElement('aside');
    note.className = 'est-note';
    note.textContent = 'Model estimates, not prices.';
    boardRegion.querySelector('.section-head').appendChild(note);
    toTop = document.createElement('button');
    toTop.className = 'to-top';
    toTop.type = 'button';
    toTop.textContent = '↑ Top';
    page.appendChild(toTop);
    root.replaceChildren(page, detailRegion);
    countHeaderStats();
    onScroll();
  }

  function onScroll() {
    var t = boardRegion.querySelector('table'), h = t.tHead, b = t.getBoundingClientRect(), y = Math.max(0, Math.min(-b.top, b.height - h.offsetHeight - 160)), r = toTop.getBoundingClientRect(), w = boardRegion.getBoundingClientRect();
    h.style.transform = y ? 'translateY(' + y + 'px)' : '';
    h.classList.toggle('tips-down', b.top < 120);
    toTop.hidden = scrollY < 1.5 * innerHeight || r.left < w.right && r.right > w.left && r.top < w.bottom && r.bottom > w.top;
  }
  addEventListener('scroll', onScroll);
  addEventListener('resize', onScroll);

  function renderBoard() {
    page.classList.remove('is-entering');
    UI.updateBoardResults(boardRegion.querySelector('[data-results="board"]'), State.compute());
    onScroll();
  }

  function mark(s) {
    boardRegion.querySelectorAll('tr').forEach(function (r) { r.classList.toggle('on', r.dataset.slug === s); });
  }

  function renderDetail() {
    var v = State.compute(), detail = v.selected && UI.detail(v.data, v.selected), scrim = document.createElement('div');
    mark(v.selected);
    detailRegion.replaceChildren();
    page.inert = !!detail;
    html.style.paddingRight = detail ? innerWidth - html.clientWidth + 'px' : '';
    html.classList.toggle('locked', !!detail);
    if (detail) {
      scrim.className = 'scrim';
      scrim.dataset.close = '1';
      detailRegion.append(scrim, detail);
      step(0);
    }
  }

  function step(by) {
    var i = trail.indexOf(State.getState().selected) + by, slug = trail[i], d = detailRegion.lastChild, f, b;
    if (by) {
      if (!slug) return;
      b = document.activeElement.dataset.nav;
      f = UI.detail(State.getData(), slug);
      State.update({ selected: slug });
      mark(slug);
      d.replaceChildren.apply(d, f.childNodes);
      d.setAttribute('aria-label', f.getAttribute('aria-label'));
      d.scrollTop = 0;
      opener = boardRegion.querySelector('tr[data-slug="' + slug + '"]') || page.querySelector('[data-slug="' + slug + '"]') || opener;
      openerRegion = opener.closest('[data-results]');
    }
    d.querySelector('[data-nav=prev]').disabled = i < 1;
    d.querySelector('[data-nav=next]').disabled = i > trail.length - 2;
    b = d.querySelector(b ? '[data-nav=' + b + ']' : '[data-close]');
    (b.disabled ? d : b).focus();
  }

  function openDetail(source) {
    opener = source;
    openerRegion = source.closest('[data-results]');
    var v = State.update({ selected: source.dataset.slug });
    trail = v.rows.map(slugOf);
    if (trail.indexOf(v.selected) < 0) trail = v.order.map(slugOf);
    renderDetail();
  }

  function closeDetail() {
    var slug = State.getState().selected;
    if (!slug) return;
    State.update({ selected: null });
    renderDetail();
    var target = opener && opener.isConnected ? opener : openerRegion && openerRegion.isConnected ? openerRegion.querySelector('[data-slug="' + slug + '"]') : null, b;
    if (target) {
      target.focus();
      b = target.getBoundingClientRect();
      if (b.bottom < 0 || b.top > innerHeight) target.scrollIntoView({ block: 'center' });
    }
    opener = openerRegion = null;
  }

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
    if (e.target.closest('.info-tip')) return;
    var sort = e.target.closest('[data-sort]'), close = e.target.closest('[data-close]'), g = e.target.closest('[data-grade]');
    if (g) {
      g = g.dataset.grade;
      State.update({ grade: State.getState().grade === g ? 'all' : g });
      root.querySelector('[data-filter=grade]').value = State.getState().grade;
      renderBoard();
      root.querySelector('[data-grade=' + g + ']').focus();
    } else if (sort) {
      var key = sort.dataset.sort;
      State.sortBy(key);
      renderBoard();
      var sortedHeader = root.querySelector('[data-sort="' + key + '"]');
      if (sortedHeader) sortedHeader.focus();
    } else if (e.target === toTop) {
      var h1 = page.querySelector('h1');
      h1.tabIndex = -1;
      h1.focus();
      scrollTo(0, 0);
    } else if (close) {
      closeDetail();
    } else if (e.target.dataset.nav) {
      step(e.target.dataset.nav === 'next' ? 1 : -1);
    } else {
      var row = e.target.closest('[data-slug]');
      if (row) openDetail(row);
    }
  });

  root.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-slug]')) {
      e.preventDefault();
      openDetail(e.target);
    }
  });

  function placeTip(e) {
    var t = e.target.closest('.info-tip');
    if (!t) return;
    var c = t.closest('.detail') || page, b = getComputedStyle(t, '::after'), p = getComputedStyle(c), box = c.getBoundingClientRect(), a = t.getBoundingClientRect();
    var w = ['width', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce(function (sum, k) { return sum + parseFloat(b[k]); }, 0);
    var min = box.left + parseFloat(p.paddingLeft), max = box.right - parseFloat(p.paddingRight) - w;
    var x = t.classList.contains('info-tip-right') ? a.right - w : a.left + (a.width - w) / 2;
    t.style.setProperty('--tip-x', Math.max(min, Math.min(x, max)) - a.left - t.clientLeft + 'px');
  }
  root.addEventListener('mouseover', placeTip);
  root.addEventListener('focusin', placeTip);
  window.addEventListener('resize', function () {
    root.querySelectorAll('.info-tip[style]').forEach(function (t) { t.style.removeProperty('--tip-x'); });
  });

  document.addEventListener('keydown', function (e) {
    var by = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (e.key === 'Escape') closeDetail();
    else if (by && State.getState().selected) {
      e.preventDefault();
      step(by);
    }
  });

  mount();
}());
