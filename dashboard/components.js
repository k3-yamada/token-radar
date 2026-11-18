(function (global) {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function sig(n) {
    return Number(n).toPrecision(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }

  function usd(n) {
    if (n == null || !isFinite(n)) return '—';
    var a = Math.abs(n), p = a >= 1e9 ? n / 1e9 : a >= 1e6 ? n / 1e6 : a >= 1e3 ? n / 1e3 : n, suffix = a >= 1e9 ? 'B' : a >= 1e6 ? 'M' : a >= 1e3 ? 'K' : '';
    return '$' + sig(p) + suffix;
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

  function tip(text) {
    var marker = el('span', 'info-tip', 'i');
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

  function band(low, high, max) {
    var wrap = el('span', 'whisker'), track = el('span', 'whisker-track'), range = el('span', 'whisker-range');
    range.style.left = Math.max(0, low / max * 100) + '%';
    range.style.width = Math.max(1, (high - low) / max * 100) + '%';
    track.appendChild(range);
    wrap.append(track, el('small', 'band-text', usd(low) + '–' + usd(high)));
    return wrap;
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
    v.shortlist.forEach(function (r) {
      var item = el('button', 'short-item');
      item.type = 'button';
      item.dataset.slug = r.slug;
      item.append(el('b', 'short-name', r.name), el('span', 'short-value num', usd(r.implied_value_usd)), band(r.value_low_usd, r.value_high_usd, Math.max(r.value_high_usd * 1.05, r.implied_value_usd)), grade(r.confidence, gradeMeaning(v.data, r.confidence)), el('small', 'short-share', (100*r.peer_token_share).toFixed(1) + '% peers tokenized'));
      list.appendChild(item);
    });
    if (!v.shortlist.length) list.appendChild(el('p', 'muted', 'No rows have enough evidence for this shortlist.'));
    s.appendChild(list);
    return s;
  }

  function board(v) {
    var sectionEl = el('section', 'board');
    sectionEl.append(section('Ranked board', 'Select a protocol to open its detail view.'), controls(v));
    var summary = el('div', 'grade-strip');
    ['A', 'B', 'C'].forEach(function (g) {
      var item = el('span', '', g + ' '), count = el('b', '', v.grades[g]);
      item.appendChild(count);
      summary.appendChild(item);
    });
    summary.appendChild(tip(['A', 'B', 'C'].map(function (g) { return gradeMeaning(v.data, g); }).join(' ')));
    sectionEl.appendChild(summary);
    var table = el('table'), head = el('thead'), tr = el('tr');
    [['Rank', 'rank'], ['Protocol', 'name'], ['Category', 'category'], ['TVL', 'tvl'], ['Tokenized peers', '', 'Share of category TVL held by protocols that already have a token.'], ['Implied value', 'value', 'The whisker is the uncertainty band from the calibration set’s quartiles.']].forEach(function (x) {
      var th = el('th'), b = el('button', '', x[0]);
      if (x[1]) b.dataset.sort = x[1];
      th.appendChild(b);
      if (x[2]) th.appendChild(tip(x[2]));
      tr.appendChild(th);
    });
    head.appendChild(tr);
    table.appendChild(head);
    var body = el('tbody');
    v.rows.forEach(function (r) {
      var row = el('tr');
      row.tabIndex = 0;
      row.dataset.slug = r.slug;
      var rank = el('td', 'num', r.rank), name = el('td', 'protocol', r.name), cat = el('td', '', r.category || 'Other'), tvl = el('td', 'num', usd(r.tvl_usd)), peers = el('td', 'num', (100*r.peer_token_share).toFixed(1) + '%'), val = el('td', 'estimate');
      name.appendChild(r.watchlist ? el('small', 'watch', 'WATCHLIST') : el('span'));
      var main = el('div', 'value-line');
      main.append(el('b', 'primary-value num', precise(r.implied_value_usd)), band(r.value_low_usd, r.value_high_usd, Math.max(r.value_high_usd * 1.05, r.implied_value_usd)));
      main.appendChild(grade(r.confidence, gradeMeaning(v.data, r.confidence)));
      val.appendChild(main);
      row.append(rank, name, cat, tvl, peers, val);
      body.appendChild(row);
    });
    if (!v.rows.length) {
      var empty = el('tr'), cell = el('td', 'empty', 'No protocols match these filters.');
      cell.colSpan = 6;
      empty.appendChild(cell);
      body.appendChild(empty);
    }
    table.appendChild(body);
    var wrap = el('div', 'table-wrap');
    wrap.appendChild(table);
    sectionEl.appendChild(wrap);
    sectionEl.appendChild(el('p', 'count', v.rows.length + ' of ' + v.data.rows.length + ' protocols'));
    return sectionEl;
  }

  function chart(v) {
    var s = el('section', 'below chart');
    s.append(section('Top 20 by implied value', 'Bars reach the point estimate; whiskers show each low–high band.'));
    var list = el('div', 'bar-list'), max = v.top.length ? v.top[0].implied_value_usd : 1;
    v.top.forEach(function (r) {
      var row = el('div', 'bar-row'), label = el('span', 'bar-name', r.name), track = el('span', 'bar-track'), point = el('span', 'bar-point'), range = el('span', 'bar-whisker');
      point.style.width = r.implied_value_usd / max * 100 + '%';
      range.style.left = r.value_low_usd / max * 100 + '%';
      range.style.width = Math.max(1, (r.value_high_usd - r.value_low_usd) / max * 100) + '%';
      track.append(point, range);
      row.append(label, track, el('span', 'num bar-value', usd(r.implied_value_usd)), grade(r.confidence, gradeMeaning(v.data, r.confidence)));
      list.appendChild(row);
    });
    s.appendChild(list);
    return s;
  }

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
    var explanation = el('p', 'method-copy', 'The model is validated by leaving out each live protocol in turn and estimating it from the rest. Large protocols are valued at a lower multiple of TVL, because that is what the issued protocols show; the measured global log-ratio slope is ' + d.size_adjustment_slope.toFixed(4) + '. The measured upward bias is corrected by a factor of ' + d.bias_correction_factor.toFixed(3) + '. The band is the middle half of the errors this model actually made in backtesting, per basis, widened just enough to cover half of them. The board median band ratio is ' + boardMedianBandRatio.toFixed(2) + '×. Separate band multipliers are calibrated for category rows (' + widths.category.toFixed(2) + '×) and global-anchored rows (' + widths.global_anchored.toFixed(2) + '×). Overall leave-one-out coverage is ' + (100*d.calibration_backtest.band_coverage).toFixed(1) + '% with median absolute log error ' + typicalError + '×. Category coverage is ' + (100*basis.category.band_coverage).toFixed(1) + '% and global-anchored coverage is ' + (100*basis.global_anchored.band_coverage).toFixed(1) + '%. The 128 leave-one-out estimates have a Spearman rank correlation of ' + d.rank_quality.spearman.toFixed(3) + ' with realized market caps; ' + d.rank_quality.top10_overlap + ' of the predicted top 10 are in the realized top 10. ' + biasText + ' (median log error ' + bias.toFixed(3) + '); selection shrink ' + (d.selection_shrink.adopted ? 'was adopted' : 'was not adopted') + '. Calibration uses the median of winsorized, globally size-adjusted log-ratios as its centre, with unweighted peer quartiles and dispersion-aware shrinkage toward the global set. The size adjustment is linear in log TVL; tested alternatives did not meet the adoption threshold. Ratios are winsorized at the global 1st and 99th percentiles so one extreme peer cannot dominate a category. A category with one live peer uses the global-anchored basis. A protocol carrying a token symbol or Gecko ID is treated as recording a token and is never ranked. Zero market caps count as no evidence; the global set excludes ' + m.global_excluded_categories.join(', ') + '. Growth uses the protocol’s percentile rank among snapshot protocols reporting a 7-day change; missing changes receive the neutral midpoint. G2 percentile growth and M1 log-age maturity factors are normalized so their medians are 1. Missing listed_at ages use the snapshot median known age (' + d.derived_unknown_listed_age_days + ' days).  Peer share is weighted by TVL; detail shows the protocol count. Grades are support-and-precision labels: A needs at least 10 calibration peers and band ratio at most 10; B needs at least 5 peers and band ratio at most 30; all others are C. Measured error did not rise with band width alone in this snapshot, which is why peer support remains part of the grade. In leave-one-out backtesting, A carried ' + d.grade_backtest.A.count + ' estimates with ' + (100*d.grade_backtest.A.coverage).toFixed(1) + '% coverage and ' + Math.exp(d.grade_backtest.A.median_absolute_log_error).toFixed(1) + '× median absolute log error; B carried ' + d.grade_backtest.B.count + ' with ' + (100*d.grade_backtest.B.coverage).toFixed(1) + '% coverage and ' + Math.exp(d.grade_backtest.B.median_absolute_log_error).toFixed(1) + '× error; C carried ' + d.grade_backtest.C.count + ' with ' + (100*d.grade_backtest.C.coverage).toFixed(1) + '% coverage and ' + Math.exp(d.grade_backtest.C.median_absolute_log_error).toFixed(1) + '× error. Each rank carries a range from resampling the calibration ratios 200 times. Wide ranges mark ranks the evidence cannot separate. Leaving out any single calibration peer keeps on average ' + (100*d.top20_jackknife_overlap).toFixed(1) + '% of the top 20 in place.');
    s.appendChild(explanation);
    var table = el('table'), head = el('thead'), tr = el('tr');
    ['Set', 'Live peers', 'Median ratio', 'Raw p25', 'Raw p75'].forEach(function (x) { tr.appendChild(el('th', '', x)); });
    head.appendChild(tr);
    table.appendChild(head);
    var body = el('tbody');
    d.calibration.slice().sort(function (a, b) { return a.category === 'global' ? -1 : b.live_count - a.live_count; }).forEach(function (x) {
      var r = el('tr');
      [x.category === 'global' ? 'Global' : x.category, x.live_count, Number(x.median_ratio).toPrecision(3) + '×', Number(x.p25_ratio).toPrecision(3) + '×', Number(x.p75_ratio).toPrecision(3) + '×'].forEach(function (y, i) { r.appendChild(el('td', i ? 'num' : '', y)); });
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

  function detail(d, slug) {
    var r = d.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return null;
    var s = el('section', 'detail'), close = el('button', 'close', 'Close detail');
    close.dataset.close = '1';
    s.append(close, el('h2', '', r.name), el('p', 'detail-value', precise(r.implied_value_usd) + ' implied value · ' + usd(r.value_low_usd) + '–' + usd(r.value_high_usd) + ' band'));
    s.appendChild(el('p', 'rank-range', 'Rank ' + r.rank + ' · plausible range ' + r.rank_low + '–' + r.rank_high + ' across 200 resamples of the calibration ratios'));
    var facts = el('div', 'facts');
    [['Category', r.category || 'Other'], ['TVL', usd(r.tvl_usd)], ['7-day growth multiplier', r.growth_multiplier, 'Growth uses the protocol’s percentile rank among snapshot protocols reporting a 7-day change; missing changes get the neutral midpoint. Multipliers are normalized so their median is 1.'], ['Maturity multiplier', r.maturity_multiplier, 'Maturity grows with log age; multipliers are normalized so their medians are 1.'], ['Ratio source', r.category_ratio_source + ' · ' + r.ratio_live_count + ' peers']].forEach(function (x) { var label = el('span', '', x[0]); if (x[2]) label.appendChild(tip(x[2])); facts.append(label, el('b', '', x[1])); });
    s.appendChild(facts);
    var take = el('div', 'what-takes');
    take.append(el('h3', '', 'What it takes'));
    var details = el('div', 'facts');
    [['Plan capital', usd(r.plan_capital_usd)], ['Plan fees', usd(r.plan_fees_usd)], ['Time span', r.plan_weeks + ' weeks']].forEach(function (x) { details.append(el('span', '', x[0]), el('b', '', x[1])); });
    take.appendChild(details);
    var share = d.calibration.filter(function (x) { return x.category === (r.category || 'Other'); })[0];
    take.appendChild(el('p', 'peer-detail', share ? share.peer_tokenized_count + ' of ' + share.peer_total_count + ' ' + (r.category || 'Other') + ' protocols already have a token' : (100*r.peer_token_share).toFixed(1) + '% of peers already have a token'));
    s.appendChild(take);
    var steps = el('ol', 'steps');
    r.farm_steps.forEach(function (x) { steps.appendChild(el('li', '', x)); });
    s.append(el('h3', '', 'Derivation and farm plan'), steps);
    return s;
  }

  global.RadarComponents = { header: header, shortlist: shortlist, board: board, chart: chart, method: method, live: live, detail: detail };
}(window));
