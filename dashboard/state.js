(function (global) {
  'use strict';

  var data = global.RADAR;
  var state = { query: '', category: 'all', chain: 'all', grade: 'all', watchlist: false, sort: 'rank', direction: 1, selected: null };

  // First click on a column: magnitudes (TVL, implied value) start largest-first; text columns start A–Z; rank starts
  // at 1, which is also largest-first by implied value. Clicking the active column again flips it.
  var SORT_START = { rank: 1, name: 1, category: 1, tvl: -1, value: -1 };

  function sortBy(key) {
    return update({ sort: key, direction: state.sort === key ? -state.direction : (SORT_START[key] || 1) });
  }

  function value(r) {
    return r.implied_value_usd;
  }

  function compute() {
    if (!data) return { data: null, rows: [], top: [], grades: { A: 0, B: 0, C: 0 }, categories: [], chains: [] };
    var rows = data.rows.filter(function (r) {
      return (!state.query || r.name.toLowerCase().indexOf(state.query.toLowerCase()) >= 0) &&
        (state.category === 'all' || r.category === state.category) &&
        (state.chain === 'all' || (r.chains || []).indexOf(state.chain) >= 0) &&
        (state.grade === 'all' || r.confidence === state.grade) && (!state.watchlist || r.watchlist);
    });
    var key = state.sort, dir = state.direction;
    rows.sort(function (a, b) {
      var x = key === 'name' ? a.name : key === 'category' ? (a.category || '') : key === 'tvl' ? a.tvl_usd : key === 'value' ? value(a) : a.rank;
      var y = key === 'name' ? b.name : key === 'category' ? (b.category || '') : key === 'tvl' ? b.tvl_usd : key === 'value' ? value(b) : b.rank;
      return typeof x === 'string' ? x.localeCompare(y) * dir : (x - y) * dir;
    });
    // The grade strip sits in the board results, beside the "N of M protocols" count, so it counts the filtered rows.
    var grades = { A: 0, B: 0, C: 0 };
    rows.forEach(function (r) { grades[r.confidence] = (grades[r.confidence] || 0) + 1; });
    var peerCounts = {};
    data.calibration.forEach(function (x) { if (x.category !== 'global') peerCounts[x.category] = { tokenized: x.peer_tokenized_count, total: x.peer_total_count }; });
    var shortlist = data.rows.filter(function (r) { return r.confidence !== 'C'; }).slice().sort(function (a, b) { return value(b) - value(a); }).slice(0, 6);
    return {
      data: data,
      rows: rows,
      top: data.rows.slice().sort(function (a, b) { return value(b) - value(a); }).slice(0, 20),
      shortlist: shortlist,
      peerCounts: peerCounts,
      grades: grades,
      query: state.query,
      category: state.category,
      chain: state.chain,
      grade: state.grade,
      watchlist: state.watchlist,
      categories: Array.from(new Set(data.rows.map(function (r) { return r.category; }).filter(Boolean))).sort(),
      chains: Array.from(new Set(data.rows.reduce(function (all, r) { return all.concat(r.chains || []); }, []))).sort(),
      selected: state.selected,
      sort: state.sort,
      direction: state.direction
    };
  }

  function update(patch) {
    Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
    return compute();
  }

  global.RadarState = { getData: function () { return data; }, getState: function () { return state; }, compute: compute, update: update, sortBy: sortBy };
}(window));
