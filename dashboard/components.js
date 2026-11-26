(function (global) {
  'use strict';

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

  function fixed3(n) {
    var s = Number(n).toPrecision(3);
    return /e/.test(s) ? plain(Number(s)) : s;
  }

  function sig(n) {
    return fixed3(n).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }

  var USD_UNITS = ['', 'K', 'M', 'B', 'T'];

  function usd(n) {
    if (n == null || !isFinite(n)) return '—';
    var unit = 0;
    while (unit < USD_UNITS.length - 1 && Math.abs(Number((n / Math.pow(1000, unit)).toPrecision(3))) >= 1000) unit++;
    return '$' + sig(n / Math.pow(1000, unit)) + USD_UNITS[unit];
  }

  function ratio(n) {
    return fixed3(n) + '×';
  }

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

  function tip(text, alignRight) {
    var marker = el('span', alignRight ? 'info-tip info-tip-right' : 'info-tip', 'i');
    marker.tabIndex = 0;
    marker.dataset.tip = text;
    marker.setAttribute('role', 'img');
    marker.setAttribute('aria-label', text);
    return marker;
  }

  var LC_LABEL = 'share of protocols this age that record a token (cross-sectional share, not a launch probability; not used in the value or the rank)';

  function category(r) { return r.category || 'Other'; }

  function pct(x) {
    return (100 * x).toFixed(1) + '%';
  }

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

  function grade(g, explain) {
    var wrap = el('span', 'grade-wrap');
    wrap.append(el('span', 'grade grade-' + g.toLowerCase(), g), tip(explain));
    return wrap;
  }

  function ordinal(n) {
    return n + (['st', 'nd', 'rd'][n % 1 || n % 100 > 10 && n % 100 < 14 ? 3 : n % 10 - 1] || 'th');
  }

  function needs(q, kind) {
    return q.min_peers + kind + ' peers and band ratio at most ' + q.max_band_ratio;
  }

  function times(m) { return Math.exp(m.median_absolute_log_error).toFixed(1); }

  function gradeMeaning(d, g) {
    var metric = d.grade_backtest[g];
    var error = metric.count && metric.median_absolute_log_error != null ? '×' + times(metric) : 'unmeasured';
    var coverage = metric.count && metric.coverage != null ? pct(metric.coverage) : 'unmeasured';
    var q = d.grade_rules, b = q.B;
    var rule = q[g] ? 'At least ' + needs(q[g], ' calibration') + '.' : 'Fewer than ' + b.min_peers + ' peers, or band ratio above ' + b.max_band_ratio + '.';
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
    heading.append(el('h1', '', 'Pre-token watchlist'), tip('Read the board by implied value; the whisker shows the uncertainty band. Select any row for its derivation and farm plan.'));
    title.append(el('div', 'eyebrow', 'TOKEN LAUNCH RADAR · ' + d.model_version.toUpperCase()), heading);
    var metrics = el('div', 'metrics');
    [[d.scanned_size, 'Protocols scanned'], [d.watchlist_size, 'Watchlist covered'], [d.board_size, 'Board rows']].forEach(function (x) { metric(metrics, x); });
    var a = d.audit;
    h.append(title, metrics, el('p', 'audit', a.total + ' scanned = ' + a.tokenized + ' tokenized + ' + a.pre_token + ' pre-token · ' + a.ranked_rows + ' ranked · ' + a.excluded_pre_token + ' excluded (' + a.excluded_pre_token_by_reason.map(function (x) { return x.count + ' ' + x.reason; }).join(', ') + ') · watchlist ' + a.watchlist.present + '/' + a.watchlist.required));
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
    var grades = tally(function (r) { return 'grade ' + r.confidence; }), cats = tally(function (r) { return category(r) + ' (' + pct(r.peer_token_share) + ' tokenized)'; });
    s.append(el('h2', '', 'Start here'), el('p', '', 'The largest estimates with real evidence' + (cats[0] ? ': ' + (grades[1] ? '' : 'all ') + grades.join(', ') + '; ' + cats.join(', ') : '') + '.'));
    var list = el('div', 'shortlist');
    var scale = valueScale(v.data.rows);
    v.shortlist.forEach(function (r) {
      var item = el('div', 'short-item'), open = el('button', 'short-name short-open', r.name);
      open.type = 'button';
      open.dataset.slug = r.slug;
      open.setAttribute('aria-label', r.name + ', ' + usd(r.implied_value_usd) + ' implied value, grade ' + r.confidence + '. Open detail');
      item.append(el('span', 'rank-badge num', r.rank), open, el('span', 'short-value num', usd(r.implied_value_usd)), band(r.value_low_usd, r.implied_value_usd, r.value_high_usd, scale, category(r) + ' · TVL ' + usd(r.tvl_usd)), grade(r.confidence, gradeMeaning(v.data, r.confidence)));
      list.appendChild(item);
    });
    if (!v.shortlist.length) list.appendChild(el('p', '', 'No rows have enough evidence for this shortlist.'));
    s.appendChild(list);
    return s;
  }

  function board(v) {
    var sectionEl = el('section', 'board');
    sectionEl.append(section('Ranked board', 'Select a protocol to open its detail view.'), controls(v));
    var results = el('div');
    results.dataset.results = 'board';
    sectionEl.appendChild(results);
    updateBoardResults(results, v);
    return sectionEl;
  }

  function updateBoardResults(sectionEl, v) {
    if (!sectionEl.children.length) {
      var liveCount = el('p', 'count');
      liveCount.setAttribute('role', 'status');
      liveCount.setAttribute('aria-live', 'polite');
      liveCount.setAttribute('aria-atomic', 'true');
      sectionEl.append(el('div', 'grade-strip'), el('div', 'table-wrap'), liveCount);
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
    var table = el('table'), head = el('thead'), tr = el('tr');
    [['Rank', 'rank'], ['Protocol', 'name'], ['Category', 'category'], ['Chains', ''], ['TVL', 'tvl'], ['Tokenized peers', '', 'Share of category TVL held by protocols that record a token.'], ['Implied value', 'value', 'The whisker is the uncertainty band: the middle half of the model’s leave-one-out backtest errors for the row’s basis, widened to cover half of them.']].forEach(function (x, i) {
      var th = el('th', 'c' + i), b = el(x[1] ? 'button' : 'span', '', x[0]);
      if (x[1]) {
        var on = v.sort === x[1];
        b.dataset.sort = x[1];
        if (on) th.setAttribute('aria-sort', v.direction === 1 ? 'ascending' : 'descending');
        b.appendChild(el('span', on ? 'sort-marker' : 'sort-marker idle', on ? v.direction === 1 ? ' ↑' : ' ↓' : ' ↕')).setAttribute('aria-hidden', 'true');
      }
      th.appendChild(b);
      if (x[2]) th.appendChild(tip(x[2], x[1] === 'value'));
      if (i > 5) th.appendChild(el('small', 'scale-note', 'Bands, one log scale for all rows: ' + usd(scale.min) + '–' + usd(Math.pow(10, scale.logMin + scale.span))));
      tr.appendChild(th);
    });
    head.appendChild(tr);
    table.appendChild(head);
    var body = el('tbody');
    v.rows.forEach(function (r) {
      var row = el('tr');
      row.tabIndex = 0;
      row.dataset.slug = r.slug;
      var rank = el('td', 'rank-cell', r.rank), name = el('td', 'protocol', r.name), cat = el('td', '', category(r)), chains = el('td', 'chains-cell'), tvl = el('td', 'tvl-cell num'), peers = el('td', 'num', pct(r.peer_token_share)), val = el('td');
      var rowChains = r.chains || [];
      chains.textContent = rowChains.length ? rowChains[0] + (rowChains.length > 1 ? ' +' + (rowChains.length - 1) : '') : '—';
      chains.title = rowChains.join(', ');
      tvl.appendChild(el('span', '', usd(r.tvl_usd)));
      var tvlBar = el('span', 'tvl-bar'), tvlFill = el('i');
      tvlFill.style.width = Math.log(r.tvl_usd / minTvl) / tvlSpan * 100 + '%';
      tvlBar.appendChild(tvlFill);
      tvl.appendChild(tvlBar);
      var pick = picks.indexOf(r.slug) >= 0, tags = name.appendChild(r.watchlist || pick ? el('small', 'watch', r.watchlist ? 'WATCHLIST' : '') : el('span'));
      if (pick) tags.appendChild(el('span', 'short-tag', 'SHORTLIST'));
      var main = el('div', 'value-line');
      main.append(el('b', 'primary-value num', usd(r.implied_value_usd)), band(r.value_low_usd, r.implied_value_usd, r.value_high_usd, scale));
      main.appendChild(grade(r.confidence, gradeMeaning(v.data, r.confidence) + ageLine(v.data, r)));
      val.appendChild(main);
      row.append(rank, name, cat, chains, tvl, peers, val);
      body.appendChild(row);
    });
    if (!v.rows.length) {
      var empty = el('tr'), cell = el('td', 'empty', 'No protocols match these filters.');
      cell.colSpan = 7;
      empty.appendChild(cell);
      body.appendChild(empty);
    }
    table.appendChild(body);
    sectionEl.children[1].replaceChildren(table);
    var countText = v.rows.length + ' of ' + v.data.rows.length + ' protocols';
    if (sectionEl.children[2].textContent !== countText) sectionEl.children[2].textContent = countText;
  }

  function curve(v) {
    var rows = v.data.rows.slice().sort(function (a, b) { return a.rank - b.rank; }), n = rows.length, s = el('section', 'curve'), c = s.appendChild(el('div')), vd = v.data.validation;
    if (vd) s.appendChild(el('div')).append(section('Validation', 'Out-of-sample checks, defined in the Validation section below.'), valTiles(vd, 2), valNote(vd));
    c.append(section('Value by rank', 'Implied value of all ' + n + ' board rows with each row’s low–high band shaded. Red dots mark the ' + v.shortlist.length + ' shortlist protocols.'));
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
    return s;
  }

  function chart(v) {
    var s = el('section', 'below chart');
    s.append(section('Top ' + v.top.length + ' by implied value', 'Bars reach the point estimate; whiskers show each low–high band.'));
    var list = el('div', 'bar-list'), max = v.top.reduce(function (m, r) { return Math.max(m, r.implied_value_usd, r.value_high_usd); }, 0) || 1;
    v.top.forEach(function (r) {
      var row = el('div', 'bar-row'), label = el('span', 'bar-name', r.name), track = el('span', 'bar-track'), point = el('span', 'bar-point'), range = el('span', 'bar-whisker');
      var left = Math.max(0, Math.min(99, r.value_low_usd / max * 100));
      point.style.width = Math.max(0, Math.min(100, r.implied_value_usd / max * 100)) + '%';
      range.style.left = left + '%';
      range.style.width = Math.min(100 - left, Math.max(1, (r.value_high_usd - r.value_low_usd) / max * 100)) + '%';
      track.append(point, range);
      row.append(label, track, el('span', 'num bar-value', usd(r.implied_value_usd)), grade(r.confidence, gradeMeaning(v.data, r.confidence)));
      list.appendChild(row);
    });
    s.appendChild(list);
    return s;
  }

  function factor(m) { return m.error_factor == null ? '—' : '×' + m.error_factor.toFixed(2); }
  function nominal(b) { return (100 * b.nominal_coverage).toFixed(0) + '%'; }
  function error(m) { return m.median_absolute_log_error == null ? '—' : m.median_absolute_log_error.toFixed(4); }

  function valTiles(v, parts) {
    var w = v.walkForward, bands = v.coverage.bands, tiles = el('div', 'vals');
    function held(b) { return nominal(b) + ' band held ' + pct(b.held_out.coverage) + ' (' + b.held_out.covered + '/' + b.held_out.count + ')'; }
    [
      [factor(v.loo), 'Leave-one-out · log error ' + error(v.loo) + ' · ×1.0\xa0=\xa0perfect', 'Median absolute log error over all ' + v.loo.count + ' tokenized peers, each predicted without itself. Unclamped, no peer dropped.'],
      [factor(v.loo.strict), 'Strict LOO · ' + error(v.loo.strict), 'The same, with the size slope and the bias correction refit in every fold.'],
      [factor(w), 'Walk-forward · ' + error(w), w.dated_peers + ' dated peers split at ' + w.split_date + ': fitted on the earlier ' + w.train_count + ', the later ' + w.test_count + ' predicted once.'],
      [pct(bands[0].held_out.coverage), 'Band coverage, held out (nominal\xa0' + nominal(bands[0]) + ')', 'Nominal ' + held(bands[0]) + '; nominal ' + held(bands[1]) + ', against the other peers’ residual quantiles.']
    ].forEach(function (x) {
      var m = metric(tiles, x);
      if (parts > 2) m.append(el('p', 'peer-detail', x[2]));
    });
    return tiles;
  }

  function valNote(v) { return el('p', 'peer-detail', 'Smaller error is better; coverage is measured against a nominal ' + nominal(v.coverage.bands[0]) + '.'); }

  function validation(d) {
    var v = d.validation, s = el('section', 'below validation'), tiles = valTiles(v, 3), pair = el('div', 'pair'), left = el('div'), right = el('div');
    s.append(section('Validation', 'Computed at build time from the sealed snapshot, for the exact model the board ships.'));
    var beats = v.ablation.rows.filter(function (r) { return r.beats_full; }).map(function (r) { return r.label + ' beats the full model by ' + (-r.delta_vs_full).toFixed(4) + '. '; }).join('');
    left.append(tableOf(['Ablation, same leave-one-out', 'Error', 'Factor', 'vs full'], v.ablation.rows.map(function (r) {
      return [r.label, error(r), factor(r), r.key === 'full' ? '—' : (r.delta_vs_full > 0 ? '+' : '−') + Math.abs(r.delta_vs_full).toFixed(4) + (r.beats_full ? ' · beats full model' : '')];
    }), 1), el('p', 'peer-detail', beats + 'The size adjustment carries the model; growth and maturity help modestly; a plain curve is within noise.'));
    right.append(tableOf(['Tokenless age', 'Protocols', 'With token', 'Share'], d.launchContext.bands.map(function (b) {
      return [b.band, b.n, b.with_token_record, pct(b.share_with_token_record)];
    }), 1), el('p', 'peer-detail', 'Launch context: ' + LC_LABEL + '.'));
    pair.append(left, right);
    s.append(tiles, valNote(v), pair);
    return s;
  }

  var MODEL_DEFAULT_UNKNOWN_AGE_DAYS = 365;

  function method(d) {
    var s = el('details', 'below method disclosure'), summary = el('summary', 'disclosure-summary'), m = d.model;
    summary.append(el('b', '', 'Model and calibration'), el('span', '', d.model_version + ' estimates, calibrated only from this snapshot’s live-token set.'));
    s.appendChild(summary);
    var widths = d.band_width_multipliers;
    var basis = d.calibration_backtest.by_basis;
    var bias = d.selection_shrink.bias_log;
    var biasText = bias >= 0 ? 'The predicted top 10 ran high by a median ' + bias.toFixed(3) + ' log points' : 'The predicted top 10 ran low by a median ' + Math.abs(bias).toFixed(3) + ' log points';
    var bandRatios = d.rows.map(function(row) { return row.value_high_usd / row.value_low_usd; }).sort(function(a, b) { return a - b; });
    var boardMedianBandRatio = bandRatios.length % 2 ? bandRatios[(bandRatios.length - 1) / 2] : (bandRatios[bandRatios.length / 2 - 1] + bandRatios[bandRatios.length / 2]) / 2;
    var unknownAgeSource = d.derived_unknown_listed_age_days === MODEL_DEFAULT_UNKNOWN_AGE_DAYS ? 'model default age' : 'snapshot median known age';
    var amplitudeText = d.fitted_factor_amplitudes ? 'Before normalization each factor is raised to its fitted amplitude (growth ' + d.fitted_factor_amplitudes.growth + ', maturity ' + d.fitted_factor_amplitudes.maturity + '). ' : '';
    function gradeCarried(g, noun, errorLabel) {
      var metric = d.grade_backtest[g];
      if (!metric.count) return metric.count + noun;
      return metric.count + noun + ' with ' + pct(metric.coverage) + ' coverage and ×' + times(metric) + errorLabel;
    }
    var explanation = el('div', 'method-copy');
    [
      ['', ['The model is validated by leaving out each live protocol in turn and estimating it from the rest. The band is the middle half of the errors this model actually made in backtesting, per basis, widened just enough to cover half of them. In-sample band coverage is ' + pct(d.calibration_backtest.band_coverage) + ' by construction (' + pct(d.validation.coverage.bands[0].held_out.coverage) + ' held out); the median absolute log error is ' + error(d.validation.loo) + ' (factor ' + factor(d.validation.loo) + ').']],
      ['Basis and centre', ['Large protocols are valued at a lower multiple of TVL, because that is what the issued protocols show; the measured global log-ratio slope is ' + d.size_adjustment_slope.toFixed(4) + '. The measured ' + (d.bias_correction_factor < 1 ? 'upward' : 'downward') + ' bias is corrected by a factor of ' + d.bias_correction_factor.toFixed(3) + '. Calibration uses the median of winsorized, globally size-adjusted log-ratios as its centre, with unweighted peer quartiles and dispersion-aware shrinkage toward the global set. The size adjustment is linear in log TVL; tested alternatives did not meet the adoption threshold.', 'Ratios are winsorized at the global ' + d.winsor_percentiles.map(ordinal).join(' and ') + ' percentiles so one extreme peer cannot dominate a category. A category with one live peer uses the global-anchored basis. A protocol carrying a token symbol or Gecko ID is treated as recording a token and is never ranked. Zero market caps count as no evidence; the global set excludes ' + m.global_excluded_categories.join(', ') + '.']],
      ['Growth, maturity and peer share', ['Growth uses the protocol’s percentile rank among snapshot protocols reporting a 7-day change; missing changes receive the neutral midpoint. The growth factor (from that percentile) and the maturity factor (from log age) are normalized so their medians are 1. ' + amplitudeText + 'Missing listed_at ages use the ' + unknownAgeSource + ' (' + d.derived_unknown_listed_age_days + ' days). Peer share is weighted by TVL; detail shows the protocol count.']],
      ['Bands and coverage', ['The board median band ratio is ' + boardMedianBandRatio.toFixed(2) + '×. Separate band multipliers are calibrated for category rows (' + widths.category.toFixed(2) + '×) and global-anchored rows (' + widths.global_anchored.toFixed(2) + '×). Category coverage is ' + pct(basis.category.band_coverage) + ' and global-anchored coverage is ' + pct(basis.global_anchored.band_coverage) + '.']],
      ['Rank quality', ['The ' + d.calibration_backtest.peers_evaluated + ' leave-one-out estimates have a Spearman rank correlation of ' + d.rank_quality.spearman.toFixed(3) + ' with realized market caps; ' + d.rank_quality.top10_overlap + ' of the predicted top 10 are in the realized top 10. ' + biasText + ' (median log error ' + bias.toFixed(3) + '); selection shrink ' + (d.selection_shrink.adopted ? 'was adopted' : 'was not adopted') + '.', 'Each rank carries a range from resampling the calibration ratios ' + d.resample_count + ' times. Wide ranges mark ranks the evidence cannot separate. Leaving out any single calibration peer keeps on average ' + pct(d.top20_jackknife_overlap) + ' of the top 20 in place.']],
      ['Grades', ['Grades are support-and-precision labels: A needs at least ' + needs(d.grade_rules.A, ' calibration') + '; B needs at least ' + needs(d.grade_rules.B, '') + '; all others are C. Measured error did not rise with band width alone in this snapshot, which is why peer support remains part of the grade.', 'In leave-one-out backtesting, A carried ' + gradeCarried('A', ' estimates', ' median error factor') + '; B carried ' + gradeCarried('B', '', ' error factor') + '; C carried ' + gradeCarried('C', '', ' error factor') + '.']]
    ].forEach(function (x) {
      if (x[0]) explanation.appendChild(el('h3', '', x[0]));
      x[1].forEach(function (t) { explanation.appendChild(el('p', x[0] ? '' : 'method-lead', t)); });
    });
    s.appendChild(explanation);
    s.appendChild(tableOf(['Set', 'Live peers', 'Median ratio', 'Raw p25', 'Raw p75'], d.calibration.slice().sort(function (a, b) { return a.category === 'global' ? -1 : b.live_count - a.live_count; }).map(function (x) {
      return [x.category === 'global' ? 'Global' : x.category, x.live_count, ratio(x.median_ratio), ratio(x.p25_ratio), ratio(x.p75_ratio)];
    }), 1));
    return s;
  }

  function live(d) {
    var s = el('details', 'below live disclosure'), summary = el('summary', 'disclosure-summary');
    summary.append(el('b', '', 'Live-token set'), el('span', '', 'Unranked calibration examples from the same snapshot.'));
    s.appendChild(summary);
    s.appendChild(tableOf(['Protocol', 'Category', 'Chains', 'TVL', 'Market cap'], d.live.map(function (x) {
      return [x.name, category(x), (x.chains || []).length, usd(x.tvl_usd), usd(x.mcap_usd)];
    }), 2));
    return s;
  }

  function derivation(d, r) {
    var wrap = el('div', 'derivation'), list = el('ol', 'steps');
    var basis = r.ratio_basis === 'category' ? 'the ' + r.category_ratio_source + ' set (' + r.ratio_live_count + ' live peers), shrunk toward the global set'
      : r.ratio_basis === 'global-anchored' ? 'the global set, because ' + r.category_ratio_source + ' has a single live peer (global-anchored basis)'
      : 'the global set, because the category has no live peers';
    var bias = d.bias_correction_factor, afterGrowth = r.base_usd * r.growth_multiplier;
    var age = r.age_days == null ? 'listing date unknown, so the ' + d.derived_unknown_listed_age_days + '-day fallback age is used' : 'age used: ' + r.age_days + ' days, listed ' + r.listed_at;
    var rebuilt = r.tvl_usd * r.category_ratio_used * bias, shrunk = Math.abs(rebuilt / r.base_usd - 1) > .01;
    [
      'TVL ' + usd(r.tvl_usd) + ' × ratio ' + r.category_ratio_used + ' × bias correction ' + bias.toFixed(3) + ' = base ' + usd(r.base_usd) + '. The ratio is the market-cap-to-TVL ratio from ' + basis + ', adjusted for this protocol’s size' + (shrunk ? '; the base also carries the selection shrink applied to the predicted top ' + d.selection_shrink.top_n : '') + '.',
      'Base ' + usd(r.base_usd) + ' × growth multiplier ' + r.growth_multiplier + ' = ' + usd(afterGrowth) + '. 7-day TVL change: ' + (r.change_7d == null ? 'not reported, so the neutral midpoint is used' : r.change_7d + '%') + '.',
      usd(afterGrowth) + ' × maturity multiplier ' + r.maturity_multiplier + ' = implied value ' + usd(r.implied_value_usd) + '. Maturity: ' + age + '.'
    ].forEach(function (x) { list.appendChild(el('li', '', x)); });
    wrap.append(el('h4', 'steps-label', 'Derivation'), list, el('p', 'peer-detail', 'Ratio and multipliers are shown rounded to four decimals; the base and the implied value are the model’s own stored figures.'));
    return wrap;
  }

  function detail(d, slug) {
    var r = d.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return null;
    var s = el('section', 'detail'), close = el('button', 'close', 'Close detail');
    close.dataset.close = '1';
    s.tabIndex = -1;
    s.setAttribute('role', 'dialog');
    s.setAttribute('aria-modal', 'true');
    s.setAttribute('aria-label', r.name);
    s.append(close, el('h2', '', r.name), grade(r.confidence, gradeMeaning(d, r.confidence)), el('p', 'detail-value', usd(r.implied_value_usd) + ' implied value · ' + usd(r.value_low_usd) + '–' + usd(r.value_high_usd) + ' band'));
    s.appendChild(el('p', 'rank-range', 'Rank ' + r.rank + ' · plausible range ' + r.rank_low + '–' + r.rank_high + ' from ' + d.resample_count + ' calibration-set resamples, with growth and maturity factors held fixed'));
    var facts = el('div', 'facts');
    [['Category', category(r)], ['TVL', usd(r.tvl_usd)], ['Implied value ÷ TVL', fixed3(r.implied_value_usd / r.tvl_usd), 'This row’s implied value divided by its TVL, from the unrounded figures. Not the calibration ratio used in the derivation.'], ['7-day growth multiplier', r.growth_multiplier, 'Growth uses the protocol’s percentile rank among snapshot protocols reporting a 7-day change; missing changes get the neutral midpoint. Multipliers are normalized so their median is 1.'], ['Maturity multiplier', r.maturity_multiplier, 'Maturity grows with log age; multipliers are normalized so their medians are 1.']].forEach(function (x) { var label = el('span', '', x[0]); if (x[2]) label.appendChild(tip(x[2])); facts.append(label, el('b', '', x[1])); });
    s.appendChild(facts);
    var take = el('div', 'what-takes');
    take.append(el('h3', '', 'What it takes'));
    var details = el('div', 'facts');
    var fe = r.farm_economics, fa = d.farm_assumptions;
    [['Plan capital', usd(r.plan_capital_usd)], ['Time span', r.plan_weeks + ' weeks'], ['Step executions', fe.step_executions], ['Hours', fe.hours], ['Cost, gas + time', usd(fe.cost_usd_low) + '–' + usd(fe.cost_usd_high)]].forEach(function (x) { details.append(el('span', '', x[0]), el('b', '', x[1])); });
    take.appendChild(details);
    var share = d.calibration.filter(function (x) { return x.category === category(r); })[0];
    take.appendChild(el('p', 'peer-detail', share ? 'Tokenized peers, by protocol count: ' + share.peer_tokenized_count + ' of ' + share.peer_total_count + ' ' + category(r) + ' protocols record a token' : 'Tokenized peers, by TVL share (this category has no calibration set, so no protocol count): ' + pct(r.peer_token_share) + ' of ' + category(r) + ' TVL sits in protocols that record a token'));
    take.appendChild(el('p', 'peer-detail', 'Cost assumes gas $' + fa.gas_usd_per_step_low + '-$' + fa.gas_usd_per_step_high + ' per step, ' + fa.minutes_per_step + ' minutes per step and time at $' + fa.value_of_time_usd_per_hour + '/hour. These are assumptions, not snapshot data.'));
    s.appendChild(take);
    var steps = el('ol', 'steps');
    r.farm_steps.forEach(function (x) { steps.appendChild(el('li', '', x)); });
    s.append(el('h3', '', 'Derivation and farm plan'), derivation(d, r), el('h4', 'steps-label', 'Farm plan'), steps);
    return s;
  }

  global.RadarComponents = { header: header, shortlist: shortlist, board: board, updateBoardResults: updateBoardResults, curve: curve, chart: chart, validation: validation, method: method, live: live, detail: detail, usd: usd, ratio: ratio };
}(window));
