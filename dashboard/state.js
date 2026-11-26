(function (global) {
  'use strict';

  var data = global.RADAR;
  var state = { query: '', category: 'all', chain: 'all', grade: 'all', watchlist: false, sort: 'rank', direction: 1, selected: null };

  // First click on a column: magnitudes (TVL, implied value) start largest-first; text columns start A–Z; rank starts
  // at 1, which is also largest-first by implied value. Clicking the active column again flips it.
  var SORT_START = { rank: 1, name: 1, category: 1, tvl: -1, value: -1 };

  function sortBy(key) {
    return update({ sort: key, direction: state.sort === key ? -state.direction : SORT_START[key] });
  }

  function compute() {
    // Trimmed; matches name, category or chain.
    var q = state.query.trim().toLowerCase();
    var rows = data.rows.filter(function (r) {
      return [r.name, r.category].concat(r.chains).join('|').toLowerCase().indexOf(q) >= 0 &&
        (state.category === 'all' || r.category === state.category) &&
        (state.chain === 'all' || (r.chains || []).indexOf(state.chain) >= 0) &&
        (state.grade === 'all' || r.confidence === state.grade) && (!state.watchlist || r.watchlist);
    });
    var key = state.sort, dir = state.direction;
    function pick(r) { return key === 'name' ? r.name : key === 'category' ? (r.category || '') : key === 'tvl' ? r.tvl_usd : key === 'value' ? r.implied_value_usd : r.rank; }
    rows.sort(function (a, b) {
      var x = pick(a), y = pick(b);
      return typeof x === 'string' ? x.localeCompare(y) * dir : (x - y) * dir;
    });
    // The grade strip sits in the board results, beside the "N of M protocols" count, so it counts the filtered rows.
    var grades = { A: 0, B: 0, C: 0 };
    rows.forEach(function (r) { grades[r.confidence] = (grades[r.confidence] || 0) + 1; });
    function byValue(a, b) { return b.implied_value_usd - a.implied_value_usd; }
    var shortlist = data.rows.filter(function (r) { return r.confidence !== 'C'; }).sort(byValue).slice(0, 6);
    return {
      data: data,
      rows: rows,
      top: data.rows.slice().sort(byValue).slice(0, 20),
      shortlist: shortlist,
      grades: grades,
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
