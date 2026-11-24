(function (global) {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // A number in plain decimal notation, whatever its magnitude (String() switches to an exponent at 1e21 and below 1e-6).
  function plain(x) {
    var a = Math.abs(x);
    if (!a) return '0';
    if (a >= 1e21) return (x < 0 ? '-' : '') + BigInt(a).toString();
    if (a >= 1) return String(x);
    return x.toFixed(Math.min(100, 2 - Math.floor(Math.log(a) / Math.LN10)));
  }

  // Three significant figures, never in exponential form: toPrecision(3) returns "1.00e+3" from 1000 up and below 1e-6.
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
    // The unit is chosen on the rounded figure, so 999,500 prints as $1M rather than $1000K.
    var unit = 0;
    while (unit < USD_UNITS.length - 1 && Math.abs(Number((n / Math.pow(1000, unit)).toPrecision(3))) >= 1000) unit++;
    return '$' + sig(n / Math.pow(1000, unit)) + USD_UNITS[unit];
  }

  function ratio(n) {
    return fixed3(n) + '×';
  }

  function precise(n) {
    return usd(n);
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

  function grade(g, explain) {
    var chip = el('span', 'grade grade-' + g.toLowerCase(), g);
    if (explain) {
      var wrap = el('span', 'grade-wrap');
      wrap.append(chip, tip(explain));
      return wrap;
    }
    return chip;
  }

  function gradeMeaning(d, g) {
    var metric = d.grade_backtest[g];
    var error = metric.count && metric.median_absolute_log_error != null ? Math.exp(metric.median_absolute_log_error).toFixed(1) + '×' : 'unmeasured';
    var coverage = metric.count && metric.coverage != null ? (100 * metric.coverage).toFixed(1) + '%' : 'unmeasured';
    var rule = g === 'A' ? 'At least 10 calibration peers and band ratio at most 10.' : g === 'B' ? 'At least 5 calibration peers and band ratio at most 30.' : 'Fewer than 5 peers, or band ratio above 30.';
    return 'Grade ' + g + ': ' + rule + ' In leave-one-out backtesting, this grade carried ' + metric.count + ' estimates, ' + coverage + ' band coverage, and ' + error + ' median absolute log error.';
  }

  function band(low, estimate, high, scale, isShortlist, share) {
    var wrap = el('span', 'whisker' + (isShortlist ? ' shortlist-whisker' : '')), track = el('span', 'whisker-track'), range = el('span', 'whisker-range');
    var start = Math.log(Math.max(low, scale.min)) / Math.LN10;
    var end = Math.log(Math.max(high, scale.min)) / Math.LN10;
    var point = Math.log(Math.max(estimate, scale.min)) / Math.LN10;
    range.style.left = Math.max(0, (start - scale.logMin) / scale.span * 100) + '%';
    range.style.width = Math.max(1, (end - start) / scale.span * 100) + '%';
    var marker = el('span', 'whisker-point');
    marker.style.left = Math.max(0, Math.min(100, (point - scale.logMin) / scale.span * 100)) + '%';
    track.appendChild(marker);
    track.appendChild(range);
    wrap.append(track);
    wrap.append(el('small', 'band-text', usd(low) + '–' + usd(high) + (isShortlist ? ' · ' + share : '')));
    return wrap;
  }

  function valueScale(rows) {
    var min = Infinity, max = 0;
    rows.forEach(function (r) { if (r.value_low_usd > 0) min = Math.min(min, r.value_low_usd); max = Math.max(max, r.value_high_usd); });
    if (!isFinite(min) || max <= min) { min = 1; max = 10; }
    var logMin = Math.log(min) / Math.LN10, logMax = Math.log(max) / Math.LN10;
    return { min: min, logMin: logMin, span: Math.max(.01, logMax - logMin) };
  }

  function header(d) {
    var h = el('header', 'header'), title = el('div', 'title');
    var heading = el('div', 'title-line');
    heading.append(el('h1', '', 'Pre-token watchlist'), tip('Read the board by implied value; the whisker shows the uncertainty band. Select any row for its derivation and farm plan.'));
    title.append(el('div', 'eyebrow', 'TOKEN LAUNCH RADAR · ' + d.model_version.toUpperCase()), heading);
    var metrics = el('div', 'metrics');
    [[d.scanned_size, 'Protocols scanned'], [d.watchlist_size, 'Watchlist covered'], [d.board_size, 'Board rows']].forEach(function (x) {
      var m = el('div', 'metric');
      m.append(el('b', 'num', x[0]), el('span', '', x[1]));
      metrics.appendChild(m);
    });
    h.append(title, metrics);
    return h;
  }

  function controls(v) {
    var box = el('div', 'controls'), search = el('input');
    search.type = 'search';
    search.placeholder = 'Search protocols';
    search.value = v.query;
    search.dataset.filter = 'query';
    search.setAttribute('aria-label', 'Search protocols');
    box.appendChild(search);
    [['Category', 'category', v.categories], ['Chain', 'chain', v.chains], ['Grade', 'grade', ['A', 'B', 'C']]].forEach(function (x) {
      var s = el('select');
      s.dataset.filter = x[1];
      s.setAttribute('aria-label', 'Filter by ' + x[0].toLowerCase());
      nodeOption(s, 'All ' + (x[1] === 'category' ? 'categories' : x[0].toLowerCase() + 's'), 'all');
      x[2].forEach(function (o) { nodeOption(s, o, o); });
      s.value = v[x[1]];
      box.appendChild(s);
    });
    var label = el('label', 'toggle'), check = el('input');
    check.type = 'checkbox';
    check.checked = v.watchlist;
    check.dataset.filter = 'watchlist';
    label.append(check, el('span', '', 'Watchlist only'));
    box.appendChild(label);
    return box;
  }

  function shortlist(v) {
    var s = el('section', 'start-here');
    s.append(el('h2', '', 'Start here'), el('p', '', 'The largest estimates with real evidence behind them.'));
    var list = el('div', 'shortlist');
    var scale = valueScale(v.data.rows);
    v.shortlist.forEach(function (r, i) {
      // The card is a plain container. Its name is the button, stretched over the whole card by CSS (.short-open::after),
      // so the card stays fully clickable while the focusable grade tip is the button's sibling, never its descendant.
      var item = el('div', 'short-item'), open = el('button', 'short-name short-open', r.name);
      open.type = 'button';
      open.dataset.slug = r.slug;
      open.setAttribute('aria-label', r.name + ', ' + usd(r.implied_value_usd) + ' implied value, grade ' + r.confidence + '. Open detail');
      var share = (100*r.peer_token_share).toFixed(1) + '% peers tokenized';
      item.append(el('span', 'rank-badge num', String(i + 1)), open, el('span', 'short-value num', usd(r.implied_value_usd)), band(r.value_low_usd, r.implied_value_usd, r.value_high_usd, scale, true, share), grade(r.confidence, gradeMeaning(v.data, r.confidence)));
      list.appendChild(item);
    });
    if (!v.shortlist.length) list.appendChild(el('p', 'muted', 'No rows have enough evidence for this shortlist.'));
    s.appendChild(list);
    return s;
  }

  function board(v) {
    var sectionEl = el('section', 'board');
    sectionEl.append(section('Ranked board', 'Select a protocol to open its detail view.'), controls(v));
    var results = el('div', 'board-results');
    results.dataset.results = 'board';
    sectionEl.appendChild(results);
    updateBoardResults(results, v);
    return sectionEl;
  }

  function updateBoardResults(sectionEl, v) {
    // The three parts persist across re-renders and only their contents are replaced: the count is the page's one
    // live region, and a live region announces changes to a node that stays in the document.
    if (!sectionEl.children.length) {
      var liveCount = el('p', 'count');
      liveCount.setAttribute('role', 'status');
      liveCount.setAttribute('aria-live', 'polite');
      liveCount.setAttribute('aria-atomic', 'true');
      sectionEl.append(el('div', 'grade-strip'), el('div', 'table-wrap'), liveCount);
    }
    var scale = valueScale(v.data.rows), picks = (v.shortlist || []).map(function (r) { return r.slug; });
    var maxTvl = v.data.rows.reduce(function (max, r) { return Math.max(max, r.tvl_usd || 0); }, 0) || 1;
    // Grade counts describe the rows the table below is showing (state.js counts the filtered rows).
    var summary = el('div', 'grade-strip');
    ['A', 'B', 'C'].forEach(function (g) {
      var item = el('span', '', g + ' '), count = el('b', '', v.grades[g]);
      item.appendChild(count);
      summary.appendChild(item);
    });
    summary.appendChild(tip(['A', 'B', 'C'].map(function (g) { return gradeMeaning(v.data, g); }).join(' '), true));
    var table = el('table'), head = el('thead'), tr = el('tr');
    [['Rank', 'rank'], ['Protocol', 'name'], ['Category', 'category'], ['Chains', ''], ['TVL', 'tvl'], ['Tokenized peers', '', 'Share of category TVL held by protocols that already have a token.'], ['Implied value', 'value', 'The whisker is the uncertainty band: the middle half of the model’s leave-one-out backtest errors for the row’s basis, widened to cover half of them.']].forEach(function (x) {
      // Only sortable columns get a button; the others are plain labels.
      var th = el('th'), b = el(x[1] ? 'button' : 'span', '', x[0]);
      if (x[1]) {
        b.dataset.sort = x[1];
        if (v.sort === x[1]) {
          th.setAttribute('aria-sort', v.direction === 1 ? 'ascending' : 'descending');
          b.appendChild(el('span', 'sort-marker', v.direction === 1 ? ' ↑' : ' ↓'));
        }
      }
      th.appendChild(b);
      if (x[2]) th.appendChild(tip(x[2], x[1] === 'value'));
      tr.appendChild(th);
    });
    head.appendChild(tr);
    table.appendChild(head);
    var body = el('tbody');
    v.rows.forEach(function (r) {
      var row = el('tr');
      row.tabIndex = 0;
      row.dataset.slug = r.slug;
      var rank = el('td', 'rank-cell', r.rank), name = el('td', 'protocol', r.name), cat = el('td', '', r.category || 'Other'), chains = el('td', 'chains-cell'), tvl = el('td', 'tvl-cell num'), peers = el('td', 'num', (100*r.peer_token_share).toFixed(1) + '%'), val = el('td', 'estimate');
      var rowChains = r.chains || [];
      chains.textContent = rowChains.length ? rowChains[0] + (rowChains.length > 1 ? ' +' + (rowChains.length - 1) : '') : '—';
      tvl.appendChild(el('span', '', usd(r.tvl_usd)));
      var tvlBar = el('span', 'tvl-bar'), tvlFill = el('i');
      tvlFill.style.width = Math.max(0, Math.min(100, (r.tvl_usd || 0) / maxTvl * 100)) + '%';
      tvlBar.appendChild(tvlFill);
      tvl.appendChild(tvlBar);
      // Rows that are also Start-here cards carry a second tag beside the watchlist one.
      var tags = name.appendChild(r.watchlist || picks.indexOf(r.slug) >= 0 ? el('small', 'watch', r.watchlist ? 'WATCHLIST' : '') : el('span'));
      if (picks.indexOf(r.slug) >= 0) tags.appendChild(el('span', 'short-tag', 'SHORTLIST'));
      var main = el('div', 'value-line');
      main.append(el('b', 'primary-value num', precise(r.implied_value_usd)), band(r.value_low_usd, r.implied_value_usd, r.value_high_usd, scale));
      main.appendChild(grade(r.confidence, gradeMeaning(v.data, r.confidence)));
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
    sectionEl.children[0].replaceChildren.apply(sectionEl.children[0], Array.prototype.slice.call(summary.children));
    sectionEl.children[1].replaceChildren(table);
    var countText = v.rows.length + ' of ' + v.data.rows.length + ' protocols';
    if (sectionEl.children[2].textContent !== countText) sectionEl.children[2].textContent = countText;
  }

  // Implied value by rank for every board row: log y, the low–high band shaded behind the line, shortlist rows dotted.
  // The plot is an SVG stretched to the column (viewBox 0–100 both ways, strokes unscaled); the axis text is HTML over it.
  function curve(v) {
    var rows = v.data.rows.slice().sort(function (a, b) { return a.rank - b.rank; }), n = rows.length, s = el('section', 'curve');
    s.append(section('Value by rank', 'Implied value of all ' + n + ' board rows; the shaded area is each row’s low–high band, the dots are the Start-here shortlist.'));
    if (!n) return s;
    function log(x) { return Math.log(Math.max(x, 1)) / Math.LN10; }
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
    v.shortlist.forEach(function (r) { var i = rows.indexOf(r); if (i >= 0) svg += '<path class="curve-dot" d="M' + x(i) + ' ' + y(r.implied_value_usd) + 'h0"/>'; });
    plot.innerHTML = svg + '</svg>';
    plot.setAttribute('role', 'img');
    plot.setAttribute('aria-label', 'Implied value by rank, log scale: ' + usd(rows[0].implied_value_usd) + ' at rank ' + rows[0].rank + ' down to ' + usd(rows[n - 1].implied_value_usd) + ' at rank ' + rows[n - 1].rank + '; bands span ' + usd(Math.pow(10, lo)) + ' to ' + usd(Math.pow(10, hi)) + '.');
    ticks.forEach(function (t) { plot.appendChild(el('span', 'curve-y', usd(t))).style.top = y(t) + '%'; });
    marks.forEach(function (m, i) {
      var label = plot.appendChild(el('span', 'curve-x', m));
      label.style.left = x(m - 1) + '%';
      label.style.transform = 'translateX(' + (i ? i === marks.length - 1 ? -100 : -50 : 0) + '%)';
    });
    // Both captions sit inside the plot box so they cost no height: the y caption in the empty top-right corner, Rank at the origin.
    plot.append(el('span', 'curve-cap', 'Implied value · USD · log scale'), el('span', 'curve-cap curve-cap-x', 'Rank'));
    s.append(plot);
    return s;
  }

  function chart(v) {
    var s = el('section', 'below chart');
    s.append(section('Top 20 by implied value', 'Bars reach the point estimate; whiskers show each low–high band.'));
    // The scale spans the largest high across the rows, as the board's whisker scale does, so no band leaves its track.
    var list = el('div', 'bar-list'), max = v.top.reduce(function (m, r) { return Math.max(m, r.implied_value_usd, r.value_high_usd); }, 0) || 1;
    v.top.forEach(function (r) {
      var row = el('div', 'bar-row'), label = el('span', 'bar-name', r.name), track = el('span', 'bar-track'), point = el('span', 'bar-point'), range = el('span', 'bar-whisker');
      var left = Math.max(0, Math.min(99, r.value_low_usd / max * 100));
      point.style.width = Math.max(0, Math.min(100, r.implied_value_usd / max * 100)) + '%';
      range.style.left = left + '%';
      // At least 1% wide so a narrow band stays visible; 'left' is capped at 99 so that minimum still fits.
      range.style.width = Math.min(100 - left, Math.max(1, (r.value_high_usd - r.value_low_usd) / max * 100)) + '%';
      track.append(point, range);
      row.append(label, track, el('span', 'num bar-value', usd(r.implied_value_usd)), grade(r.confidence, gradeMeaning(v.data, r.confidence)));
      list.appendChild(row);
    });
    s.appendChild(list);
    return s;
  }

  var MODEL_DEFAULT_UNKNOWN_AGE_DAYS = 365;

  function method(d) {
    var s = el('details', 'below method disclosure'), summary = el('summary', 'disclosure-summary'), m = d.model;
    summary.append(el('b', '', 'Model and calibration'), el('span', '', d.model_version + ' estimates, calibrated only from this snapshot’s live-token set.'));
    s.appendChild(summary);
    var typicalError = Math.exp(d.calibration_backtest.median_absolute_log_error).toFixed(1);
    var widths = d.band_width_multipliers;
    var basis = d.calibration_backtest.by_basis;
    var bias = d.selection_shrink.bias_log;
    var biasText = bias >= 0 ? 'The predicted top 10 ran high by a median ' + bias.toFixed(3) + ' log points' : 'The predicted top 10 ran low by a median ' + Math.abs(bias).toFixed(3) + ' log points';
    var bandRatios = d.rows.map(function(row) { return row.value_high_usd / row.value_low_usd; }).sort(function(a, b) { return a - b; });
    var boardMedianBandRatio = bandRatios.length % 2 ? bandRatios[(bandRatios.length - 1) / 2] : (bandRatios[bandRatios.length / 2 - 1] + bandRatios[bandRatios.length / 2]) / 2;
    // The data carries only the age in use (model.unknown_listed_age_days is overwritten with it), so adoption is
    // inferred against the model default; MODEL_DEFAULT_UNKNOWN_AGE_DAYS mirrors MODEL.unknown_listed_age_days (test-guarded).
    var unknownAgeSource = d.derived_unknown_listed_age_days === MODEL_DEFAULT_UNKNOWN_AGE_DAYS ? 'model default age' : 'snapshot median known age';
    // Present only when the fitted amplitudes were adopted (the key is absent otherwise), so the sentence above stays complete.
    var amplitudeText = d.fitted_factor_amplitudes ? 'Before normalization each factor is raised to its fitted amplitude (growth ' + d.fitted_factor_amplitudes.growth + ', maturity ' + d.fitted_factor_amplitudes.maturity + '). ' : '';
    // A grade with no backtest estimates has null coverage and error: print the count alone, never figures formatted from null.
    function gradeCarried(g, noun, errorLabel) {
      var metric = d.grade_backtest[g];
      if (!metric.count) return metric.count + noun;
      return metric.count + noun + ' with ' + (100*metric.coverage).toFixed(1) + '% coverage and ' + Math.exp(metric.median_absolute_log_error).toFixed(1) + errorLabel;
    }
    // A lead paragraph, then headed subsections. The node keeps the class method-copy; its text is the sentences below.
    var explanation = el('div', 'method-copy');
    [
      ['', ['The model is validated by leaving out each live protocol in turn and estimating it from the rest. The band is the middle half of the errors this model actually made in backtesting, per basis, widened just enough to cover half of them. Overall leave-one-out coverage is ' + (100*d.calibration_backtest.band_coverage).toFixed(1) + '% with median absolute log error ' + typicalError + '×.']],
      ['Basis and centre', ['Large protocols are valued at a lower multiple of TVL, because that is what the issued protocols show; the measured global log-ratio slope is ' + d.size_adjustment_slope.toFixed(4) + '. The measured ' + (d.bias_correction_factor < 1 ? 'upward' : 'downward') + ' bias is corrected by a factor of ' + d.bias_correction_factor.toFixed(3) + '. Calibration uses the median of winsorized, globally size-adjusted log-ratios as its centre, with unweighted peer quartiles and dispersion-aware shrinkage toward the global set. The size adjustment is linear in log TVL; tested alternatives did not meet the adoption threshold.', 'Ratios are winsorized at the global 1st and 99th percentiles so one extreme peer cannot dominate a category. A category with one live peer uses the global-anchored basis. A protocol carrying a token symbol or Gecko ID is treated as recording a token and is never ranked. Zero market caps count as no evidence; the global set excludes ' + m.global_excluded_categories.join(', ') + '.']],
      ['Growth, maturity and peer share', ['Growth uses the protocol’s percentile rank among snapshot protocols reporting a 7-day change; missing changes receive the neutral midpoint. G2 percentile growth and M1 log-age maturity factors are normalized so their medians are 1. ' + amplitudeText + 'Missing listed_at ages use the ' + unknownAgeSource + ' (' + d.derived_unknown_listed_age_days + ' days). Peer share is weighted by TVL; detail shows the protocol count.']],
      ['Bands and coverage', ['The board median band ratio is ' + boardMedianBandRatio.toFixed(2) + '×. Separate band multipliers are calibrated for category rows (' + widths.category.toFixed(2) + '×) and global-anchored rows (' + widths.global_anchored.toFixed(2) + '×). Category coverage is ' + (100*basis.category.band_coverage).toFixed(1) + '% and global-anchored coverage is ' + (100*basis.global_anchored.band_coverage).toFixed(1) + '%.']],
      ['Rank quality', ['The ' + d.calibration_backtest.peers_evaluated + ' leave-one-out estimates have a Spearman rank correlation of ' + d.rank_quality.spearman.toFixed(3) + ' with realized market caps; ' + d.rank_quality.top10_overlap + ' of the predicted top 10 are in the realized top 10. ' + biasText + ' (median log error ' + bias.toFixed(3) + '); selection shrink ' + (d.selection_shrink.adopted ? 'was adopted' : 'was not adopted') + '.', 'Each rank carries a range from resampling the calibration ratios 200 times. Wide ranges mark ranks the evidence cannot separate. Leaving out any single calibration peer keeps on average ' + (100*d.top20_jackknife_overlap).toFixed(1) + '% of the top 20 in place.']],
      ['Grades', ['Grades are support-and-precision labels: A needs at least 10 calibration peers and band ratio at most 10; B needs at least 5 peers and band ratio at most 30; all others are C. Measured error did not rise with band width alone in this snapshot, which is why peer support remains part of the grade.', 'In leave-one-out backtesting, A carried ' + gradeCarried('A', ' estimates', '× median absolute log error') + '; B carried ' + gradeCarried('B', '', '× error') + '; C carried ' + gradeCarried('C', '', '× error') + '.']]
    ].forEach(function (x) {
      if (x[0]) explanation.appendChild(el('h3', '', x[0]));
      x[1].forEach(function (t) { explanation.appendChild(el('p', x[0] ? '' : 'method-lead', t)); });
    });
    s.appendChild(explanation);
    var table = el('table'), head = el('thead'), tr = el('tr');
    ['Set', 'Live peers', 'Median ratio', 'Raw p25', 'Raw p75'].forEach(function (x) { tr.appendChild(el('th', '', x)); });
    head.appendChild(tr);
    table.appendChild(head);
    var body = el('tbody');
    d.calibration.slice().sort(function (a, b) { return a.category === 'global' ? -1 : b.live_count - a.live_count; }).forEach(function (x) {
      var r = el('tr');
      [x.category === 'global' ? 'Global' : x.category, x.live_count, ratio(x.median_ratio), ratio(x.p25_ratio), ratio(x.p75_ratio)].forEach(function (y, i) { r.appendChild(el('td', i ? 'num' : '', y)); });
      body.appendChild(r);
    });
    table.appendChild(body);
    s.appendChild(table);
    return s;
  }

  function live(d) {
    var s = el('details', 'below live disclosure'), summary = el('summary', 'disclosure-summary');
    summary.append(el('b', '', 'Live-token set'), el('span', '', 'Unranked calibration examples from the same snapshot.'));
    s.appendChild(summary);
    var table = el('table'), head = el('thead'), tr = el('tr');
    ['Protocol', 'Category', 'Chains', 'TVL', 'Market cap'].forEach(function (x) { tr.appendChild(el('th', '', x)); });
    head.appendChild(tr);
    table.appendChild(head);
    var body = el('tbody');
    d.live.forEach(function (x) {
      var r = el('tr');
      [x.name, x.category || 'Other', (x.chains || []).length, usd(x.tvl_usd), usd(x.mcap_usd)].forEach(function (y, i) { r.appendChild(el('td', i >= 2 ? 'num' : '', y)); });
      body.appendChild(r);
    });
    table.appendChild(body);
    s.appendChild(table);
    return s;
  }

  // The implied value, step by step, from the row's own model fields.
  function derivation(d, r) {
    var wrap = el('div', 'derivation'), list = el('ol', 'steps');
    var basis = r.ratio_basis === 'category' ? 'the ' + r.category_ratio_source + ' set (' + r.ratio_live_count + ' live peers), shrunk toward the global set'
      : r.ratio_basis === 'global-anchored' ? 'the global set, because ' + r.category_ratio_source + ' has a single live peer (global-anchored basis)'
      : 'the global set, because the category has no live peers';
    var bias = d.bias_correction_factor, afterGrowth = r.base_usd * r.growth_multiplier;
    var age = r.age_days == null ? 'listing date unknown, so the ' + d.derived_unknown_listed_age_days + '-day fallback age is used' : 'age used: ' + r.age_days + ' days, listed ' + r.listed_at;
    // If the stored base is not TVL × ratio × bias correction (a selection shrink rescales base and value together), say so.
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
    s.append(close, el('h2', '', r.name), grade(r.confidence, gradeMeaning(d, r.confidence)), el('p', 'detail-value', precise(r.implied_value_usd) + ' implied value · ' + usd(r.value_low_usd) + '–' + usd(r.value_high_usd) + ' band'));
    s.appendChild(el('p', 'rank-range', 'Rank ' + r.rank + ' · plausible range ' + r.rank_low + '–' + r.rank_high + ' from 200 calibration-set resamples, with growth and maturity factors held fixed'));
    var facts = el('div', 'facts');
    [['Category', r.category || 'Other'], ['TVL', usd(r.tvl_usd)], ['7-day growth multiplier', r.growth_multiplier, 'Growth uses the protocol’s percentile rank among snapshot protocols reporting a 7-day change; missing changes get the neutral midpoint. Multipliers are normalized so their median is 1.'], ['Maturity multiplier', r.maturity_multiplier, 'Maturity grows with log age; multipliers are normalized so their medians are 1.'], ['Ratio source', r.category_ratio_source + ' · ' + r.ratio_live_count + ' peers']].forEach(function (x) { var label = el('span', '', x[0]); if (x[2]) label.appendChild(tip(x[2])); facts.append(label, el('b', '', x[1])); });
    s.appendChild(facts);
    var take = el('div', 'what-takes');
    take.append(el('h3', '', 'What it takes'));
    var details = el('div', 'facts');
    [['Plan capital', usd(r.plan_capital_usd)], ['Plan fees', usd(r.plan_fees_usd)], ['Time span', r.plan_weeks + ' weeks']].forEach(function (x) { details.append(el('span', '', x[0]), el('b', '', x[1])); });
    take.appendChild(details);
    var share = d.calibration.filter(function (x) { return x.category === (r.category || 'Other'); })[0];
    // Two different measures, each named: a protocol count where the category has a calibration set, the TVL share otherwise.
    take.appendChild(el('p', 'peer-detail', share ? 'Tokenized peers, by protocol count: ' + share.peer_tokenized_count + ' of ' + share.peer_total_count + ' ' + (r.category || 'Other') + ' protocols already have a token' : 'Tokenized peers, by TVL share (this category has no calibration set, so no protocol count): ' + (100*r.peer_token_share).toFixed(1) + '% of ' + (r.category || 'Other') + ' TVL sits in protocols that already have a token'));
    s.appendChild(take);
    var steps = el('ol', 'steps');
    r.farm_steps.forEach(function (x) { steps.appendChild(el('li', '', x)); });
    s.append(el('h3', '', 'Derivation and farm plan'), derivation(d, r), el('h4', 'steps-label', 'Farm plan'), steps);
    return s;
  }

  global.RadarComponents = { header: header, shortlist: shortlist, board: board, updateBoardResults: updateBoardResults, controls: controls, curve: curve, chart: chart, method: method, live: live, detail: detail, usd: usd, ratio: ratio };
}(window));
