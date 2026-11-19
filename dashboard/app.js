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

  var page, shortlistRegion, boardRegion, detailRegion, openerSlug = null;

  function mount() {
    var v = State.compute(), d = v.data;
    page = document.createElement('div');
    page.className = 'page';
    shortlistRegion = document.createElement('div');
    shortlistRegion.dataset.results = 'shortlist';
    shortlistRegion.appendChild(UI.shortlist(v));
    boardRegion = UI.board(v);
    detailRegion = document.createElement('div');
    detailRegion.dataset.results = 'detail';
    page.append(UI.header(d), shortlistRegion, boardRegion, detailRegion);
    page.append(UI.chart(v), UI.method(d), UI.live(d));
    var note = document.createElement('aside');
    note.className = 'fixed-note';
    note.textContent = 'Model estimates, not prices.';
    page.appendChild(note);
    root.replaceChildren(page);
    renderResults(v);
    countHeaderStats();
  }

  function renderResults(v) {
    UI.updateBoardResults(boardRegion.querySelector('[data-results="board"]'), v);
    detailRegion.replaceChildren();
    if (v.selected) {
      var detail = UI.detail(v.data, v.selected);
      if (detail) detailRegion.appendChild(detail);
    }
  }

  function render() { renderResults(State.compute()); }

  root.addEventListener('input', function (e) {
    var f = e.target.dataset.filter;
    if (f) {
      var p = {};
      p[f] = f === 'watchlist' ? e.target.checked : e.target.value;
      State.update(p);
      render();
    }
  });

  root.addEventListener('change', function (e) {
    var f = e.target.dataset.filter;
    if (f) {
      var p = {};
      p[f] = f === 'watchlist' ? e.target.checked : e.target.value;
      State.update(p);
      render();
    }
  });

  root.addEventListener('click', function (e) {
    var sort = e.target.closest('[data-sort]'), close = e.target.closest('[data-close]');
    if (sort) {
      var s = State.getState(), key = sort.dataset.sort;
      State.update({ sort: key, direction: s.sort === key ? -s.direction : 1 });
      render();
      var sortedHeader = root.querySelector('[data-sort="' + key + '"]');
      if (sortedHeader) sortedHeader.focus();
    } else if (close) {
      State.update({ selected: null });
      render();
      var returnTarget = root.querySelector('[data-slug="' + openerSlug + '"]');
      if (returnTarget) returnTarget.focus();
      openerSlug = null;
    } else {
      var row = e.target.closest('[data-slug]');
      if (row) {
        openerSlug = row.dataset.slug;
        State.update({ selected: row.dataset.slug });
        render();
        document.querySelector('.detail').scrollIntoView({ block: 'nearest' });
      }
    }
  });

  root.addEventListener('keydown', function (e) {
    var row = e.target.closest('[data-slug]');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openerSlug = row.dataset.slug;
      State.update({ selected: row.dataset.slug });
      render();
      if (document.querySelector('.detail')) document.querySelector('.detail').scrollIntoView({ block: 'nearest' });
    }
  });

  mount();
}());
