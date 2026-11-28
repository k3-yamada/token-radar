// Views. Evidence first: held-out figures, chain(), derive(), panel(), FARM costs; then helpers and page sections.
(function (global) {
  'use strict';
  function factor(m) { return m.error_factor == null ? '—' : '×' + m.error_factor.toFixed(2); }
  function nominal(b) { return (100 * b.nominal_coverage).toFixed(0) + '%'; }
  function e4(x) { return x == null ? '—' : x.toFixed(4); }
  function error(m) { return e4(m.median_absolute_log_error); }
  function valTiles(v, parts) {
    var w = v.walkForward, bands = v.coverage.bands, tiles = el('div', 'vals');
    function held(b) { return nominal(b) + ' band held ' + pct(b.held_out.coverage) + ' (' + b.held_out.covered + '/' + b.held_out.count + ')'; }
    [
      [factor(v.loo), 'Leave-one-out · log error ' + error(v.loo), 'Median absolute log error over all ' + v.loo.count + ' tokenized peers with a market cap, unclamped, each predicted without itself; no peer dropped.'],
      [factor(v.loo.strict), 'Strict LOO · ' + error(v.loo.strict), 'The same, with the size slope and the bias correction refit in every fold.'],
      [factor(w), 'Walk-forward · ' + error(w), w.dated_peers + ' dated peers split at ' + w.split_date + ': fitted on the earlier ' + w.train_count + ', the later ' + w.test_count + ' predicted once.'],
      [pct(bands[0].held_out.coverage), 'Held out in ' + nominal(bands[0]) + ' band · target ' + nominal(bands[0]), 'Nominal ' + held(bands[0]) + '; nominal ' + held(bands[1]) + ', against the other peers’ residual quantiles.']
    ].forEach(function (x) {
      var m = metric(tiles, x);
      if (parts > 2) m.append(note(x[2]));
    });
    return tiles;
  }
  function valNote(v, o) { return o && o[2] != null ? note('Plain TVL-only curve, same ' + v.loo.count + ' calibration peers: ×' + Math.exp(o[0]).toFixed(2) + ' leave-one-out vs ' + factor(v.loo) + ' ours, ×' + Math.exp(o[2]).toFixed(2) + ' walk-forward vs ' + factor(v.walkForward) + ' ours; it has no growth or age input.') : ''; }
  function valLine(v) {
    var t = ['Held out: median error factor (×1 = exact) leave-one-out ', factor(v.loo), ' (unclamped, each peer priced without itself; strict ', factor(v.loo.strict), '), walk-forward ', factor(v.walkForward), ' (earlier peers price later); peers inside '], p = note('');
    v.coverage.bands.forEach(function (b, i) { if (i) t.push(', '); t[t.length - 1] += nominal(b) + ' band '; t.push(pct(b.held_out.coverage)); });
    t.push('.');
    return bolds(p, t);
  }
  function bolds(p, t) {
    t.forEach(function (x, i) { p.append(i % 2 ? el('b', '', x) : x); });
    return p;
  }
  function f5(x) { return x.toFixed(5); }
  function pow(a) { return a === 1 ? '' : '^' + a; }
  function dollars(n) { return '$' + n.toLocaleString('en-US'); }
  function chain(M, r, p) {
    var c = M.categories[r.category] || [0], n = c[0], g = M.global, K = M.k, G = M.growth, T = M.maturity;
    var raw = K[0] * c[2] / g[2], k = n < K[3] ? K[0] : Math.max(K[1], Math.min(K[2], raw)), w = n ? n / (n + k) : 0;
    var centre = n ? w * c[1] + (1 - w) * g[1] : g[1], dx = Math.log(r.tvl_usd) - M.size_center, ln = centre + M.size_slope * dx;
    var age = r.age_days == null ? M.unknown_age : r.age_days;
    var gf = Math.exp(M.amp[0] * Math.log(1 + G[0] * (2 * p - 1))) / G[1];
    var mf = Math.exp(M.amp[1] * Math.log(T[0] + T[1] * Math.log1p(Math.min(age, T[2])) / Math.log1p(T[2]))) / T[3];
    return { c: c, raw: raw, k: k, w: w, centre: centre, dx: dx, ln: ln, age: age, g: gf, m: mf, value: Math.max(1, Math.round(r.tvl_usd * Math.exp(ln) * (gf * mf) * M.bias)) };
  }
  function derive(d, M) {
    var g = M.global, K = M.k, G = M.growth, T = M.maturity, pair = el('div', 'pair derive');
    var r = d.rows.filter(function (x) { return x.slug === M.example.slug; })[0], x = chain(M, r, M.example.percentile), c = x.c, n = c[0], few = n < K[3];
    var rules = [
      ['Peers', 'r = ln(mcap/TVL) - b(ln TVL - c), winsorised to global p' + d.winsor_percentiles.join('-p') + '; global set: raw ln(mcap/TVL)'],
      ['Category', 'median m, IQR of r over n peers; global n ' + g[0] + ', m_g ' + e4(g[1]) + ', IQR_g ' + e4(g[2])],
      ['Shrinkage', 'k = ' + K[0] + ' × IQR / IQR_g in [' + K[1] + ', ' + K[2] + '], ' + K[0] + ' if n < ' + K[3] + '; w = n/(n + k); centre = w × m + (1 - w) × m_g'],
      ['Size', 'centre + b(ln TVL - c); global set: b ' + f5(M.size_slope) + ' = OLS slope of ln mcap on ln TVL - 1, c ' + e4(M.size_center) + ' = median ln TVL'],
      ['Growth', 'g = (1 + ' + G[0] + '(2p - 1))' + pow(M.amp[0]) + ' / ' + e4(G[1]) + ' (scored-row median); p = 7-day change percentile or 0.5'],
      ['Maturity', 'a = (' + T[0] + ' + ' + T[1] + ' ln(1 + min(age, ' + T[2] + ')) / ln ' + (T[2] + 1) + ')' + pow(M.amp[1]) + ' / ' + e4(T[3]) + ' (same); no date: ' + M.unknown_age + ' d'],
      ['Value', 'TVL × e^size × g × a × ' + f5(M.bias) + ', bias correction e^-(median signed LOO log error)']
    ];
    var ex = [
      ['Inputs', r.category + ' n ' + n + (n ? ', m ' + e4(c[1]) : '') + (few ? '' : ', IQR ' + e4(c[2])) + '; TVL ' + dollars(r.tvl_usd) + ', age ' + x.age + ' d, p ' + e4(M.example.percentile)],
      ['k, w', 'k = ' + (few ? K[0] : K[0] + ' × ' + e4(c[2]) + ' / ' + e4(g[2]) + ' = ' + e4(x.raw) + (x.k === x.raw ? '' : ' → ' + x.k)) + ', w = ' + f5(x.w)],
      ['Centre', n ? f5(x.w) + ' × ' + e4(c[1]) + ' + ' + f5(1 - x.w) + ' × ' + e4(g[1]) + ' = ' + e4(x.centre) : 'm_g ' + e4(x.centre)],
      ['Size', e4(x.centre) + ' + ' + f5(M.size_slope) + ' × ' + e4(x.dx) + ' = ' + e4(x.ln)],
      ['g, a', 'g ' + e4(x.g) + ', a ' + e4(x.m)],
      ['Value', dollars(r.tvl_usd) + ' × e^' + e4(x.ln) + ' × ' + e4(x.g) + ' × ' + e4(x.m) + ' × ' + f5(M.bias) + ' = ' + usd(x.value)],
      ['Board', dollars(r.implied_value_usd) + (x.value === r.implied_value_usd ? ' = chain()' : ' ≠ chain()')]
    ];
    pair.append(tableOf(['Derivation', 'Rule, fitted constants'], rules, 9), tableOf(['Rank 1: ' + r.name, 'chain()'], ex, 9));
    return pair;
  }
  function panel(d, M) {
    var g = M.global, K = M.k, a = d.audit, r = d.rows.filter(function (x) { return x.slug === M.example.slug; })[0], x = chain(M, r, M.example.percentile), p = el('div', 'panel');
    [
      ['Model: value = TVL × e^size × g × a × ', f5(M.bias), ' (e^size peer mcap/TVL ratio, g growth, a age); size = centre + b(ln TVL - c), b = ', f5(M.size_slope), ', c = ', e4(M.size_center), '; centre = w × median + (1 - w) × m_g, m_g = ', e4(g[1]), ', w = n/(n + k), k = ' + K[0] + ' × IQR / IQR_g in [' + K[1] + ', ' + K[2] + '], IQR_g = ', e4(g[2])],
      ['Rank 1, ' + r.name + ': ' + r.category + ' n ' + x.c[0] + ', TVL ' + tvl(r.tvl_usd) + ', age ' + x.age + ' d, p ' + e4(M.example.percentile) + ' → ', usd(x.value), x.value === r.implied_value_usd ? ' = board value' : ' ≠ board value'],
      ['Accounting: ', a.total + '', ' accounted for = ' + a.ranked_rows + ' ranked + ' + a.excluded_pre_token + ' excluded + ' + a.tokenized + ' tokenized; watchlist ', a.watchlist.present + ' of ' + a.watchlist.required]
    ].forEach(function (t) { p.append(bolds(note(''), t)); });
    return p;
  }
  var FARM = { steps: [0, 0, 0, 1, 0, 0], gas: { Ethereum: [1, 8], Tron: [1, 10], Bitcoin: [.4, 5], 'Solana|Algorand|Stellar|Ripple|Aptos|Sui|Bittensor|Noble|XION|Provenance': [.001, .05], 'Proton|Qubic': [0, .01], other: [.01, .25] }, minutes: 15, hourly: 30, share: .1 };
  function farmCost(weeks, chain) {
    var g = FARM.gas.other, runs = FARM.steps.reduce(function (sum, x) { return sum + (x ? weeks : 1); }, 0), hours = runs * FARM.minutes / 60, time = hours * FARM.hourly;
    for (var k in FARM.gas) if (k.split('|').indexOf(chain) >= 0) g = FARM.gas[k];
    return { runs: runs, hours: hours, gas: g, fees: runs * (g[0] + g[1]) / 2, low: runs * g[0] + time, high: runs * g[1] + time };
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function log10(x) { return Math.log(x) / Math.LN10; }
  function plain(x) {
    var a = Math.abs(x);
    if (a >= 1e21) return (x < 0 ? '-' : '') + BigInt(a).toString();
    if (a >= 1) return String(x);
    return x.toFixed(Math.min(100, 2 - Math.floor(log10(a))));
  }
  function fixed3(n, p) {
    var s = Number(n).toPrecision(p || 3);
    return /e/.test(s) ? plain(Number(s)) : s;
  }
  function estTvl(r) { return fixed3(r.implied_value_usd / r.tvl_usd); }
  function sig(n, p) { return fixed3(n, p).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); }
  var USD_UNITS = ['', 'K', 'M', 'B', 'T'];
  function usd(n, p) {
    if (n == null || !isFinite(n)) return '—';
    var unit = 0;
    while (unit < USD_UNITS.length - 1 && Math.abs(Number((n / Math.pow(1000, unit)).toPrecision(p || 3))) >= 1000) unit++;
    return '$' + sig(n / Math.pow(1000, unit), p) + USD_UNITS[unit];
  }
  // The farm steps' TVL, x places finer.
  function tvl(n, x) {
    var u = n < 1e6 ? 1 : n < 1e9 ? 2 : 3;
    return '$' + (n / Math.pow(1e3, u)).toFixed((u > 2) + 1 + ~~x) + USD_UNITS[u];
  }
  function val(s) { return parseFloat(s.slice(1)) * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[s.slice(-1)] || 1); }
  function ratio(n) { return fixed3(n) + '×'; }
  function nodeOption(select, label, value) {
    var o = el('option', '', label);
    o.value = value;
    select.appendChild(o);
  }
  function section(title, desc) {
    var h = el('div', 'section-head');
    h.append(el('h2', '', title), el('p', '', desc));
    return h;
  }
  function attrs(n, o) {
    for (var k in o) n.setAttribute(k, o[k]);
    return n;
  }
  function tip(text, alignRight) {
    var marker = el('span', alignRight ? 'info-tip info-tip-right' : 'info-tip', 'i');
    marker.tabIndex = 0;
    marker.dataset.tip = text;
    return attrs(marker, { role: 'img', 'aria-label': text });
  }
  var LC_LABEL = 'share of protocols this age that record a token (cross-sectional share, not a launch probability; not used in the value or the rank)';
  function note(text) { return el('p', 'peer-detail', text); }
  function category(r) { return r.category || 'Other'; }
  function pct(x) { return (100 * x).toFixed(1) + '%'; }
  function chg(x) { return (x < 0 ? '' : '+') + x.toFixed(1).replace('-0.0', '0.0') + '%'; }
  function ageLine(d, r) {
    var c = d.launchContext.rows[r.slug];
    return c ? '\nAge band ' + c.band + ': ' + pct(c.share_with_token_record) + ' (n=' + c.n + '), ' + LC_LABEL + '.' : '';
  }
  function tableOf(heads, rows, numFrom) {
    var table = el('table'), head = el('thead'), tr = el('tr'), body = el('tbody');
    heads.forEach(function (x) { tr.appendChild(el('th', '', x)); });
    head.appendChild(tr);
    rows.forEach(function (cells) {
      var r = el('tr');
      cells.forEach(function (y, i) { r.appendChild(el('td', i >= numFrom ? 'num' : '', y)); });
      body.appendChild(r);
    });
    table.append(head, body);
    return table;
  }
  function grade(d, r, more) {
    var g = r.confidence, wrap = el('span', 'grade-wrap');
    wrap.append(el('span', 'grade grade-' + g.toLowerCase(), g), tip(gradeMeaning(d, g) + (more || '')));
    return wrap;
  }
  function needs(q, kind) { return q.min_peers + kind + ' peers and high/low at most ' + q.max_band_ratio; }
  function gradeMeaning(d, g) {
    var metric = d.grade_backtest[g];
    var error = metric.count && metric.median_absolute_log_error != null ? '×' + Math.exp(metric.median_absolute_log_error).toFixed(2) : 'unmeasured';
    var coverage = metric.count && metric.coverage != null ? pct(metric.coverage) : 'unmeasured';
    var q = d.grade_rules, b = q.B;
    var rule = q[g] ? 'At least ' + needs(q[g], ' calibration') + '.' : 'Fewer than ' + b.min_peers + ' peers, or high/low above ' + b.max_band_ratio + '.';
    return 'Grade ' + g + ': ' + rule + ' In leave-one-out backtesting, this grade carried ' + metric.count + ' estimates, ' + coverage + ' band coverage, and median error factor ' + error + '.';
  }
  function band(low, estimate, high, scale, facts) {
    var wrap = el('span', 'whisker' + (facts ? ' shortlist-whisker' : '')), track = el('span', 'whisker-track'), range = el('span', 'whisker-range');
    var start = log10(Math.max(low, scale.min));
    var end = log10(Math.max(high, scale.min));
    var point = log10(Math.max(estimate, scale.min));
    range.style.left = Math.max(0, (start - scale.logMin) / scale.span * 100) + '%';
    range.style.width = Math.max(1, (end - start) / scale.span * 100) + '%';
    var marker = el('span', 'whisker-point');
    marker.style.left = Math.max(0, Math.min(100, (point - scale.logMin) / scale.span * 100)) + '%';
    if (facts) [6, 7, 8].forEach(function (e) {
      var at = (e - scale.logMin) / scale.span * 100;
      if (at >= 0 && at <= 100) track.appendChild(el('span', 'whisker-tick')).style.left = at + '%';
    });
    track.appendChild(marker);
    track.appendChild(range);
    wrap.append(track);
    var label = usd(low) + '–' + usd(high), text = wrap.appendChild(el('small', 'band-text', facts ? '' : label));
    if (facts) text.append(el('span', '', label), el('i', '', ' · '), el('span', '', facts));
    return wrap;
  }
  function valueScale(rows) {
    var min = Infinity, max = 0;
    rows.forEach(function (r) { if (r.value_low_usd > 0) min = Math.min(min, r.value_low_usd); max = Math.max(max, r.value_high_usd); });
    if (!isFinite(min) || max <= min) { min = 1; max = 10; }
    var logMin = log10(min), logMax = log10(max);
    return { min: min, logMin: logMin, span: Math.max(.01, logMax - logMin) };
  }
  function metric(parent, x) {
    var m = parent.appendChild(el('div', 'metric'));
    m.append(el('b', 'num', x[0]), el('span', '', x[1]));
    return m;
  }
  function header(d) {
    var h = el('header', 'header'), title = el('div');
    var heading = el('div', 'title-line');
    heading.append(el('h1', '', 'Pre-token radar'));
    title.append(el('div', 'eyebrow', 'IMPLIED TOKEN VALUE AND A COSTED FARM PLAN FOR EACH OF ' + d.board_size + ' PRE-TOKEN PROTOCOLS'), heading);
    var metrics = el('div', 'metrics');
    [[d.scanned_size, 'Protocols scanned'], [d.watchlist_size, 'Watchlist covered'], [d.board_size, 'Board rows']].forEach(function (x) { metric(metrics, x); });
    var a = d.audit;
    h.append(title, metrics, el('p', 'audit', a.total + ' scanned = ' + a.tokenized + ' tokenized + ' + a.pre_token + ' pre-token (' + a.ranked_pre_token + ' ranked + ' + a.excluded_pre_token + ' excluded: ' + a.excluded_pre_token_by_reason.map(function (x) { return x.count + ' ' + x.reason; }).join(', ') + ') · watchlist ' + a.watchlist.present + '/' + a.watchlist.required));
    return h;
  }
  function controls(v) {
    var box = el('div', 'controls'), search = el('input');
    search.type = 'search';
    search.placeholder = 'Search protocols';
    search.dataset.filter = 'query';
    search.setAttribute('aria-label', 'Search protocols');
    box.appendChild(search);
    [['Category', 'category', v.categories], ['Chain', 'chain', v.chains], ['Grade', 'grade', ['A', 'B', 'C']]].forEach(function (x) {
      var s = el('select');
      s.dataset.filter = x[1];
      s.setAttribute('aria-label', 'Filter by ' + x[0].toLowerCase());
      nodeOption(s, 'All ' + (x[1] === 'category' ? 'categories' : x[0].toLowerCase() + 's'), 'all');
      x[2].forEach(function (o) { nodeOption(s, o, o); });
      box.appendChild(s);
    });
    var label = el('label', 'toggle'), check = el('input');
    check.type = 'checkbox';
    check.dataset.filter = 'watchlist';
    label.append(check, el('span', '', 'Watchlist only'));
    box.appendChild(label);
    return box;
  }
  function shortlist(v) {
    var s = el('section', 'start-here');
    function tally(key) {
      var n = {};
      v.shortlist.forEach(function (r) { n[key(r)] = (n[key(r)] || 0) + 1; });
      return Object.keys(n).map(function (k) { return n[k] + ' ' + k; });
    }
    var top = v.shortlist[0], cats = tally(function (r) { return category(r) + ' (' + pct(r.peer_token_share) + ')'; });
    s.append(el('h2', '', 'Start here'), el('p', '', (top && top.rank > 1 ? 'Ranks 1–' + (top.rank - 1) + ' are C; largest' : 'Largest') + ' A or B estimates' + (cats[0] ? ': ' + cats.join(', ').replace(')', ' of TVL has a market cap)') : '') + '.'));
    var list = el('div', 'shortlist');
    var scale = valueScale(v.data.rows);
    v.shortlist.forEach(function (r) {
      var item = el('div', 'short-item'), open = el('button', 'short-name short-open', r.name);
      open.type = 'button';
      open.dataset.slug = r.slug;
      open.setAttribute('aria-label', r.name + ', ' + usd(r.implied_value_usd) + ' implied value, grade ' + r.confidence + '. Open detail');
      item.append(el('span', 'rank-badge num', r.rank), open, el('span', 'short-value num', usd(r.implied_value_usd)), band(r.value_low_usd, r.implied_value_usd, r.value_high_usd, scale, category(r) + ' · TVL ' + tvl(r.tvl_usd)), grade(v.data, r));
      list.appendChild(item);
    });
    if (!v.shortlist.length) list.appendChild(el('p', '', 'No A or B estimates.'));
    s.appendChild(list);
    return s;
  }
  function board(v) {
    var sectionEl = el('section', 'board');
    sectionEl.append(section('Ranked board', 'Select a row for its derivation and farm plan.'), controls(v));
    var results = el('div');
    results.dataset.results = 'board';
    sectionEl.appendChild(results);
    updateBoardResults(results, v);
    return sectionEl;
  }
  function updateBoardResults(sectionEl, v) {
    if (!sectionEl.children.length) {
      sectionEl.append(el('div', 'grade-strip'), attrs(el('p', 'count'), { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }), el('div', 'table-wrap'));
    }
    var scale = valueScale(v.data.rows), picks = v.shortlist.map(function (r) { return r.slug; });
    var tvls = v.data.rows.map(function (r) { return r.tvl_usd; }), minTvl = Math.min.apply(null, tvls), tvlSpan = Math.log(Math.max.apply(null, tvls) / minTvl) || 1;
    var summary = sectionEl.children[0];
    summary.replaceChildren();
    ['A', 'B', 'C'].forEach(function (g) {
      var item = el('button', v.grades[g] ? '' : 'zero', g + ' ');
      item.type = 'button';
      item.dataset.grade = g;
      item.setAttribute('aria-pressed', v.grade === g);
      item.setAttribute('aria-label', 'Grade ' + g + ', ' + v.grades[g] + ' rows: filter');
      item.appendChild(el('b', '', v.grades[g]));
      summary.appendChild(item);
    });
    summary.appendChild(tip(['A', 'B', 'C'].map(function (g) { return gradeMeaning(v.data, g); }).join(' '), true));
    var q = v.data.rows.map(function (r) { return r.value_high_usd / r.value_low_usd; }), lo = Math.min.apply(0, q), A = v.data.grade_rules.A.max_band_ratio;
    if (lo > A) summary.appendChild(el('span', '', 'A needs high/low ≤ ' + A + '×; every band here is ' + lo.toFixed(1) + '–' + Math.max.apply(0, q).toFixed(1) + '×, so none is A.'));
    var table = el('table'), head = el('thead'), tr = el('tr'), sorted;
    [['Rank', 'rank'], ['Protocol', 'name'], ['Category', 'category'], ['Chains', ''], ['TVL', 'tvl'], ['7d · age', '', 'Value inputs: 7-day TVL change, days since listed.'], ['Implied value', 'value', 'The whisker is the uncertainty band.'], ['Farm · cost', '', 'Capital · weeks · cost, fees + time; BE = break-even multiple of the implied value. Assumed: gas per chain, ' + FARM.minutes + ' min per step, time $' + FARM.hourly + '/hour.']].forEach(function (x, i) {
      var th = el('th', 'c' + i), b = el(x[1] ? 'button' : 'span', '', x[0]);
      if (x[1]) {
        var on = v.sort === x[1];
        if (on) sorted = x[0] + (v.direction === 1 ? ' ↑' : ' ↓');
        b.dataset.sort = x[1];
        if (on) th.setAttribute('aria-sort', v.direction === 1 ? 'ascending' : 'descending');
        b.appendChild(el('span', on ? 'sort-marker' : 'sort-marker idle', on ? v.direction === 1 ? ' ↑' : ' ↓' : ' ↕')).setAttribute('aria-hidden', 'true');
      }
      th.appendChild(b);
      if (x[2]) th.appendChild(tip(x[2], i > 5));
      if (i === 6) th.appendChild(el('small', 'scale-note', 'Bands, one log scale: ' + usd(scale.min) + '–' + usd(Math.pow(10, scale.logMin + scale.span))));
      tr.appendChild(th);
    });
    head.appendChild(tr);
    table.appendChild(head);
    var body = el('tbody');
    v.rows.forEach(function (r) {
      var row = el('tr');
      row.tabIndex = 0;
      row.dataset.slug = r.slug;
      var rank = el('td', 'rank-cell', r.rank), name = el('td', 'protocol', r.name), cat = el('td', '', category(r)), chains = el('td', 'chains-cell'), tc = el('td', 'tvl-cell num'), inp = el('td', 'num', (r.change_7d == null ? '—' : chg(r.change_7d)) + ' · ' + (r.age_days == null ? '—' : r.age_days + 'd')), val = el('td');
      var rowChains = r.chains || [];
      chains.textContent = rowChains.length ? rowChains[0] + (rowChains.length > 1 ? ' +' + (rowChains.length - 1) : '') : '—';
      chains.title = rowChains.join(', ');
      tc.appendChild(el('span', '', tvl(r.tvl_usd)));
      var tvlBar = el('span', 'tvl-bar'), tvlFill = el('i');
      tvlFill.style.width = Math.log(r.tvl_usd / minTvl) / tvlSpan * 100 + '%';
      tvlBar.appendChild(tvlFill);
      tc.appendChild(tvlBar);
      var pick = picks.indexOf(r.slug) >= 0, tags = name.appendChild(r.watchlist || pick ? el('small', 'watch', r.watchlist ? 'WATCHLIST' : '') : el('span'));
      if (pick) tags.appendChild(el('span', 'short-tag', 'START HERE'));
      var main = el('div', 'value-line'), fe = farmCost(r.plan_weeks, rowChains[0]), bm = r.farm_economics && Math.round(r.farm_economics.break_even_implied_value_usd_high / r.implied_value_usd), plan = el('td', 'plan', usd(r.plan_capital_usd) + ' · ' + r.plan_weeks + ' wk');
      main.append(el('b', 'primary-value num', usd(r.implied_value_usd)), band(r.value_low_usd, r.implied_value_usd, r.value_high_usd, scale));
      main.appendChild(grade(v.data, r, ageLine(v.data, r)));
      val.appendChild(main);
      plan.append(el('br'), usd(fe.low) + '–' + usd(fe.high) + (bm ? ' · ' + bm + '× BE' : ''));
      row.append(rank, name, cat, chains, tc, inp, val, plan);
      body.appendChild(row);
    });
    if (!v.rows.length) {
      var empty = el('tr'), cell = el('td', 'empty', 'No protocols match these filters.');
      cell.colSpan = 8;
      empty.appendChild(cell);
      body.appendChild(empty);
    }
    table.appendChild(body);
    sectionEl.children[2].replaceChildren(table);
    var countText = v.rows.length + ' of ' + v.data.rows.length + ' protocols' + (v.sort === 'rank' ? '' : ' · sorted by ' + sorted + '; Rank is by implied value');
    if (sectionEl.children[1].textContent !== countText) sectionEl.children[1].textContent = countText;
  }
  function curve(v) {
    var rows = v.data.rows.slice().sort(function (a, b) { return a.rank - b.rank; }), n = rows.length, s = el('section', 'curve'), c = s.appendChild(el('div')), vd = v.data.validation;
    if (vd) s.appendChild(el('div')).append(section('Validation', 'Held-out error factor, ×1 = exact.'), valTiles(vd, 2), valNote(vd, (global.RADAR_MODEL || {}).ols));
    c.append(section('Value by rank', 'All ' + n + ' rows, low–high bands shaded; red dots: the ' + v.shortlist.length + ' Start-here protocols.'));
    if (!n) return s;
    function log(x) { return log10(Math.max(x, 1)); }
    var lo = Infinity, hi = -Infinity;
    rows.forEach(function (r) { lo = Math.min(lo, log(r.value_low_usd), log(r.implied_value_usd)); hi = Math.max(hi, log(r.value_high_usd), log(r.implied_value_usd)); });
    var pad = (hi - lo || 1) * .04, top = hi + pad, span = hi - lo + 2 * pad;
    function x(i) { return +(n > 1 ? i / (n - 1) * 100 : 50).toFixed(2); }
    function y(usdValue) { return +((top - log(usdValue)) / span * 100).toFixed(2); }
    function path(key) { return rows.map(function (r, i) { return x(i) + ' ' + y(r[key]); }).join('L'); }
    var ticks = [], marks = [1], step = Math.max(1, Math.pow(10, Math.floor(log(n))) / 2), e, k;
    for (e = Math.ceil(lo); e <= Math.floor(hi); e++) ticks.push(Math.pow(10, e));
    if (!ticks.length) ticks = [Math.pow(10, lo), Math.pow(10, hi)];
    for (k = step; k < n - step / 2; k += step) if (k > 1) marks.push(k);
    if (n > 1) marks.push(n);
    var plot = el('div', 'curve-plot'), svg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
    ticks.forEach(function (t) { svg += '<path class="curve-grid" d="M0 ' + y(t) + 'H100"/>'; });
    svg += '<path class="curve-band" d="M' + path('value_high_usd') + 'L' + path('value_low_usd').split('L').reverse().join('L') + 'Z"/><path class="curve-line" d="M' + path('implied_value_usd') + '"/>';
    v.shortlist.forEach(function (r) { var i = rows.indexOf(r); if (i >= 0) svg += ['halo', 'dot'].map(function (c) { return '<path class="curve-' + c + '" d="M' + x(i) + ' ' + y(r.implied_value_usd) + 'h0"/>'; }).join(''); });
    plot.innerHTML = svg + '</svg>';
    plot.setAttribute('role', 'img');
    plot.setAttribute('aria-label', 'Implied value by rank, log scale: ' + usd(rows[0].implied_value_usd) + ' at rank ' + rows[0].rank + ' down to ' + usd(rows[n - 1].implied_value_usd) + ' at rank ' + rows[n - 1].rank + '; bands span ' + usd(Math.pow(10, lo)) + ' to ' + usd(Math.pow(10, hi)) + '.');
    ticks.forEach(function (t) { plot.appendChild(el('span', 'curve-y', usd(t))).style.top = y(t) + '%'; });
    marks.forEach(function (m, i) {
      var label = plot.appendChild(el('span', 'curve-x', m));
      label.style.left = x(m - 1) + '%';
      label.style.transform = 'translateX(' + (i ? i === marks.length - 1 ? -100 : -50 : 0) + '%)';
    });
    plot.append(el('span', 'curve-cap', 'Implied value · USD · log scale'), el('span', 'curve-cap curve-cap-x', 'Rank'));
    c.append(plot);
    if (global.RADAR_MODEL) s.append(panel(v.data, global.RADAR_MODEL));
    return s;
  }
  function chart(v) {
    var s = el('section', 'below chart');
    s.append(section('Top ' + v.top.length + ' by implied value', 'Point estimate and low–high band.'));
    var list = el('div', 'bar-list'), max = v.top.reduce(function (m, r) { return Math.max(m, r.implied_value_usd, r.value_high_usd); }, 0) || 1;
    v.top.forEach(function (r) {
      var row = el('div', 'bar-row'), label = el('span', 'bar-name', r.name), track = el('span', 'bar-track'), point = el('span', 'bar-point'), range = el('span', 'bar-whisker');
      var left = Math.max(0, Math.min(99, r.value_low_usd / max * 100));
      point.style.width = Math.max(0, Math.min(100, r.implied_value_usd / max * 100)) + '%';
      range.style.left = left + '%';
      range.style.width = Math.min(100 - left, Math.max(1, (r.value_high_usd - r.value_low_usd) / max * 100)) + '%';
      track.append(point, range);
      row.append(label, track, el('span', 'num bar-value', usd(r.implied_value_usd)), grade(v.data, r));
      list.appendChild(row);
    });
    s.appendChild(list);
    return s;
  }
  function validation(d) {
    var v = d.validation, s = el('section', 'below validation'), tiles = valTiles(v, 3), pair = el('div', 'pair'), left = el('div'), right = el('div'), o = (global.RADAR_MODEL || {}).ols;
    s.append(section('Validation', 'Computed at build time from the sealed snapshot, for the exact model the board ships.'));
    left.append(tableOf(['Ablation, same leave-one-out', 'Error', 'Factor', 'vs full'], v.ablation.rows.map(function (r) {
      return [r.label, error(r), factor(r), r.key === 'full' ? '—' : (r.delta_vs_full > 0 ? '+' : '−') + Math.abs(r.delta_vs_full).toFixed(3)];
    }), 1));
    if (o) left.append(note('Shipped vs plain OLS curve, log error: ' + [[v.loo, 'leave-one-out'], [v.loo.strict, 'strict LOO'], [v.walkForward, 'walk-forward']].map(function (x, i) {
      var g = e4(o[i]) - error(x[0]);
      return x[1] + ' ' + error(x[0]) + ' vs ' + e4(o[i]) + (o[i] == null ? '' : ', ' + (g > 0 ? 'shipped' : 'plain curve') + ' ahead by ' + Math.abs(g).toFixed(3));
    }).join('; ') + '.'));
    right.append(tableOf(['Listed age', 'Protocols', 'With token', 'Share'], d.launchContext.bands.map(function (b) {
      return [b.band, b.n, b.with_token_record, pct(b.share_with_token_record)];
    }), 1), note('Launch context: ' + LC_LABEL + '.'));
    pair.append(left, right);
    s.append(tiles, pair);
    if (global.RADAR_MODEL) s.append(derive(d, global.RADAR_MODEL));
    return s;
  }
  var MODEL_DEFAULT_UNKNOWN_AGE_DAYS = 365;
  function method(d) {
    var s = el('details', 'below method disclosure'), summary = el('summary', 'disclosure-summary'), m = d.model;
    summary.append(el('b', '', 'Model and calibration'), el('span', '', d.model_version + ' estimates, calibrated from this snapshot’s live tokens.'));
    s.appendChild(summary);
    var bias = d.selection_shrink.bias_log;
    var biasText = 'The predicted top 10 ran ' + (bias >= 0 ? 'high' : 'low') + ' by a median ' + Math.abs(bias).toFixed(3) + ' log points';
    var unknownAgeSource = d.derived_unknown_listed_age_days === MODEL_DEFAULT_UNKNOWN_AGE_DAYS ? 'model default age' : 'snapshot median known age';
    var explanation = el('div', 'method-copy');
    [
      ['', ['Each band is the middle half of leave-one-out errors per basis, scaled to cover half: ' + pct(d.calibration_backtest.band_coverage) + ' in sample by construction (' + pct(d.validation.coverage.bands[0].held_out.coverage) + ' held out).']],
      ['Basis', ['A protocol with a token symbol or Gecko ID records a token and is never ranked. Zero market caps count as no evidence; the global set excludes ' + m.global_excluded_categories.join(', ') + '.', 'Missing listed_at ages use the ' + unknownAgeSource + ' (' + d.derived_unknown_listed_age_days + ' days).']],
      ['Rank quality', ['The ' + d.calibration_backtest.peers_evaluated + ' leave-one-out estimates have a Spearman rank correlation of ' + d.rank_quality.spearman.toFixed(3) + ' with realized market caps; ' + d.rank_quality.top10_overlap + ' of the predicted top 10 are in the realized top 10. ' + biasText + '; selection shrink was ' + (d.selection_shrink.adopted ? '' : 'not ') + 'adopted.', 'Dropping any one calibration peer keeps on average ' + pct(d.top20_jackknife_overlap) + ' of the top 20 in the top 20.']]
    ].forEach(function (x) {
      if (x[0]) explanation.appendChild(el('h3', '', x[0]));
      x[1].forEach(function (t) { explanation.appendChild(el('p', x[0] ? '' : 'method-lead', t)); });
    });
    s.appendChild(explanation);
    s.appendChild(tableOf(['Set', 'Live peers', 'Median ratio', 'p25', 'p75'], d.calibration.slice().sort(function (a, b) { return a.category === 'global' ? -1 : b.live_count - a.live_count; }).map(function (x) {
      return [x.category === 'global' ? 'Global' : x.category, x.live_count, ratio(x.median_ratio), ratio(x.p25_ratio), ratio(x.p75_ratio)];
    }), 1));
    return s;
  }
  function live(d) {
    var s = el('details', 'below live disclosure'), summary = el('summary', 'disclosure-summary');
    summary.append(el('b', '', 'Live-token set'), el('span', '', 'Top ' + d.live.length + ' calibration peers by market cap, CEX aside; unranked.'));
    s.appendChild(summary);
    s.appendChild(tableOf(['Protocol', 'Category', 'Chains', 'TVL', 'Market cap'], d.live.map(function (x) {
      return [x.name, category(x), (x.chains || []).length, tvl(x.tvl_usd), usd(x.mcap_usd)];
    }), 2));
    return s;
  }
  function derivation(d, r) {
    var wrap = el('div', 'derivation'), list = el('ol', 'steps');
    var basis = r.ratio_basis === 'category' ? 'the ' + r.category_ratio_source + ' set (' + r.ratio_live_count + ' live peers), shrunk toward the global set'
      : r.ratio_basis === 'global-anchored' ? 'the global set shrunk toward the single live ' + r.category_ratio_source + ' peer (global-anchored basis)'
      : 'the global set, because the category has no live peers';
    var bias = d.bias_correction_factor, b = f5(bias), g = r.growth_multiplier, m = r.maturity_multiplier, A = r.base_usd * g, I = usd(r.implied_value_usd);
    var age = r.age_days == null ? 'listing date unknown, so the ' + d.derived_unknown_listed_age_days + '-day fallback age is used' : 'age used: ' + r.age_days + ' days, listed ' + r.listed_at;
    var q = r.base_usd / r.tvl_usd / bias, shrunk = Math.abs(q / r.category_ratio_used - 1) > .01, x, y, z, T, Q, S, F;
    // Widen TVL and ratio, then after-growth, then base digits until each step closes.
    l: for (x = 3; x < 7; x++) for (y = 3; y < 7; y++) for (z = 0; z < 5; z++) {
      T = tvl(r.tvl_usd, z), Q = shrunk ? r.category_ratio_used : q.toPrecision(Math.min(6, 4 + z)), S = usd(r.base_usd, x), F = usd(A, y);
      if (usd(val(T) * Q * b, x) == S && usd(val(S) * g, y) == F && usd(val(F) * m) == I) break l;
    }
    [
      ['TVL ' + T + ' × peer ratio ' + Q + ' × bias correction ' + b + ' = base ' + S + '.', 'The ratio is the market-cap-to-TVL ratio from ' + basis + ', adjusted for this protocol’s size' + (shrunk ? '; the base also carries the selection shrink applied to the predicted top ' + d.selection_shrink.top_n : '') + '.'],
      ['Base ' + S + ' × growth multiplier ' + g + ' = ' + F + '.', '7-day TVL change: ' + (r.change_7d == null ? 'not reported, so the neutral midpoint is used' : chg(r.change_7d)) + '.'],
      [F + ' × maturity multiplier ' + m + ' = implied value ' + I + '.', 'Maturity: ' + age + '.']
    ].forEach(function (x) { list.appendChild(el('li')).append(el('span', 'formula', x[0]), el('span', 'note', ' ' + x[1])); });
    wrap.append(el('h4', 'steps-label', 'Derivation'), list);
    return wrap;
  }
  function facts(list) {
    var f = el('div', 'facts');
    list.forEach(function (x) { f.append(el('span', '', x[0]), el('b', '', x[1])); });
    return f;
  }
  function detail(d, slug) {
    var r = d.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return null;
    var s = el('section', 'detail'), nav = el('div', 'nav'), close = el('button', '', 'Close detail');
    close.dataset.close = '1';
    [['← Prev', 'prev', 'ArrowUp'], ['Next →', 'next', 'ArrowDown']].forEach(function (x) {
      var b = nav.appendChild(el('button', '', x[0]));
      b.dataset.nav = x[1];
      b.setAttribute('aria-keyshortcuts', x[2]);
    });
    nav.appendChild(close);
    s.tabIndex = -1;
    attrs(s, { role: 'dialog', 'aria-modal': 'true', 'aria-label': r.name });
    s.append(nav, el('h2', '', r.name), grade(d, r), el('p', 'detail-value', usd(r.implied_value_usd) + ' implied value · ' + usd(r.value_low_usd) + '–' + usd(r.value_high_usd) + ' band'));
    s.appendChild(el('p', 'rank-range', 'Rank ' + r.rank + ' · plausible range ' + r.rank_low + '–' + r.rank_high + ' from ' + d.resample_count + ' calibration-set resamples, with growth and maturity factors held fixed'));
    if (d.validation) s.appendChild(valLine(d.validation));
    s.appendChild(facts([['Category', category(r)], ['TVL', tvl(r.tvl_usd)], ['Implied value ÷ TVL', estTvl(r)], ['7-day growth multiplier', r.growth_multiplier], ['Maturity multiplier', r.maturity_multiplier]]));
    var take = el('div', 'what-takes');
    take.append(el('h3', '', 'What it takes'));
    var c = r.chains[0], fe = farmCost(r.plan_weeks, c);
    take.appendChild(facts([['Plan capital', usd(r.plan_capital_usd)], ['Time span', r.plan_weeks + ' weeks'], ['Step executions', fe.runs], ['Hours', fe.hours], ['Cost, fees + time', usd(fe.low) + '–' + usd(fe.high)]]));
    var share = d.calibration.filter(function (x) { return x.category === category(r); })[0];
    take.appendChild(note(share ? 'By protocol count: ' + share.peer_tokenized_count + ' of ' + share.peer_total_count + ' ' + category(r) + ' protocols have a market cap' : 'By TVL share (no calibration set): ' + pct(r.peer_token_share) + ' of ' + category(r) + ' TVL sits in protocols with a market cap'));
    var be = r.farm_economics;
    take.appendChild(note('Assumed, not snapshot data: per-chain fees $' + fe.gas[0] + '-$' + fe.gas[1] + ' on ' + c + ' and ' + FARM.minutes + ' minutes per step, time at $' + FARM.hourly + '/hour' + (be ? '; verdict assumes ' + FARM.share * 100 + '% of launch value shared pro rata to capital as a share of TVL: this plan repays its cost only on a launch at ' + usd(be.break_even_implied_value_usd_low) + '–' + usd(be.break_even_implied_value_usd_high) + ' (' + Math.round(be.break_even_implied_value_usd_high / r.implied_value_usd) + '× implied value)' : '') + '.'));
    s.appendChild(take);
    var steps = el('ol', 'steps');
    r.farm_steps.forEach(function (x) { x = x.split(/ (?=Cost: )/); steps.appendChild(el('li', '', x[0])).appendChild(el('small', 'cost', x[1])); });
    s.append(el('h3', '', 'Derivation and farm plan'), derivation(d, r), el('h4', 'steps-label', 'Farm plan'), steps);
    return s;
  }
  global.RadarComponents = { header: header, shortlist: shortlist, board: board, updateBoardResults: updateBoardResults, curve: curve, chart: chart, validation: validation, method: method, live: live, detail: detail, usd: function (n) { return usd(n); }, ratio: ratio, chain: chain, panel: panel, farm: FARM, farmCost: farmCost };
}(window));
