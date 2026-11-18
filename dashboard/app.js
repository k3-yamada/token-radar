(function () {
  'use strict';

  var root = document.getElementById('app'), State = window.RadarState, UI = window.RadarComponents;
  if (!root || !State.getData()) {
    if (root) root.textContent = 'Radar data unavailable.';
    return;
  }

  function render() {
    var v = State.compute(), d = v.data, shell = document.createElement('div');
    shell.className = 'page';
    shell.append(UI.header(d), UI.shortlist(v), UI.board(v));
    if (v.selected) {
      var detail = UI.detail(d, v.selected);
      if (detail) shell.appendChild(detail);
    }
    shell.append(UI.chart(v), UI.method(d), UI.live(d));
    var note = document.createElement('aside');
    note.className = 'fixed-note';
    note.textContent = 'Model estimates, not prices.';
    shell.appendChild(note);
    root.replaceChildren(shell);
  }

  root.addEventListener('input', function (e) {
    var f = e.target.dataset.filter;
    if (f) {
      var p = {};
      p[f] = f === 'watchlist' ? e.target.checked : e.target.value;
      State.update(p);
      render();
      if (f === 'query') {
        var search = root.querySelector('[data-filter="query"]');
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }
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
    } else if (close) {
      State.update({ selected: null });
      render();
    } else {
      var row = e.target.closest('[data-slug]');
      if (row) {
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
      State.update({ selected: row.dataset.slug });
      render();
      if (document.querySelector('.detail')) document.querySelector('.detail').scrollIntoView({ block: 'nearest' });
    }
  });

  render();
}());
