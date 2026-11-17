(function () {
  'use strict';
  var D = window.RADAR;
  var root = document.getElementById('app');
  if (!D || !root) { root.textContent = 'Radar data unavailable.'; return; }
  var watch = new Set(D.rows.filter(function(r){return r.watchlist;}).map(function(r){return r.slug;}));
  var state = { q: '', category: 'all', chain: 'all', watch: false, sort: 'rank', dir: 1, selected: null };
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function usd(n) { if (n == null || !isFinite(n)) return '—'; if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K'; return money.format(n); }
  function pct(n) { return n == null ? '—' : (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%'; }
  function age(n) { return n == null ? 'Unknown' : n >= 365 ? (n / 365).toFixed(1) + 'y' : Math.round(n) + 'd'; }
  function node(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function option(select, label, value) { var o = node('option', '', label); o.value = value; select.appendChild(o); }
  function unique(xs) { return Array.from(new Set(xs.filter(Boolean))).sort(function(a,b){return String(a).localeCompare(String(b));}); }
  function control(label, element) { var f=node('div','field'), l=node('label','',label); f.append(l,element); return f; }
  function metric(label, value) { var m=node('div','metric'), b=node('b','',String(value)), s=node('span','',label); m.append(b,s); return m; }
  function sectionTitle(title, description, right) { var h=node('div','section-head'), a=node('div',''), t=node('h2','',title), p=node('p','',description); a.append(t,p); h.append(a); if(right)h.append(right); return h; }
  function pill(text) { return node('span','pill',text); }
  function setup() {
    root.replaceChildren(); var shell=node('div','console');
    var mast=node('header','mast'), brand=node('div','brand'), dot=node('span','radar-dot'); brand.append(dot,node('span','','TOKEN RADAR / FIELD CONSOLE')); mast.append(brand,node('div','snapshot','SNAPSHOT · '+D.as_of)); shell.append(mast);
    var intro=node('section','intro'), left=node('div',''), kicker=node('div','kicker','Pre-token opportunity scan'), title=node('h1','',D.name || 'Token Launch Radar'), copy=node('p','intro-copy','Pre-token protocols ranked by implied value. The board estimates value from TVL and observed live-token multiples in this snapshot.'); left.append(kicker,title,copy);
    var metrics=node('div','metrics'); metrics.append(metric('Protocols scanned',D.protocols_scanned || D.scanned_size || '—'),metric('Watchlist',D.watchlist_size),metric('Board rows',D.board_size)); intro.append(left,metrics); shell.append(intro);
    shell.append(methodSection());
    var board=node('section','board'); board.id='board'; shell.append(board);
    shell.append(liveSection()); root.append(shell); renderBoard();
  }
  function methodSection() {
    var box=node('section','card method'), title=node('h2','','How the value is derived'), body=node('div',''), p=node('p','', 'The model calibrates a market-cap-to-TVL ratio from protocols in this same snapshot whose token already trades. It uses a per-category median when at least '+D.model.category_min_live_protocols+' live protocols share that category; otherwise it uses the global median. It multiplies a pre-token protocol’s TVL by that ratio, then adjusts for 7-day TVL growth, time running with no token, and chain count.');
    var constants=node('div','constants'); constants.append(pill('Model '+D.model_version),pill('Growth clamp '+D.model.growth_clamp_min_pct+'% to +'+D.model.growth_clamp_max_pct+'%'),pill('Growth weight ×'+D.model.growth_weight),pill('Maturity '+D.model.maturity_min_factor+' + age/'+D.model.maturity_cap_days+'d × '+D.model.maturity_range),pill('Unknown age '+D.model.unknown_listed_age_days+'d'),pill('Chain bonus +'+(D.model.chain_bonus_per_extra_chain*100)+'% / chain, cap '+D.model.chain_bonus_max_extra_chains),pill('Minimum $'+D.model.minimum_implied_value_usd));
    body.append(p,constants); box.append(title,body); return box;
  }
  function buildControls() {
    var c=node('div','controls'), search=node('input'); search.type='search'; search.placeholder='Search protocol name'; search.value=state.q; search.setAttribute('aria-label','Search by protocol name'); search.addEventListener('input',function(){state.q=search.value;renderBoard();}); c.append(control('Name',search));
    var cats=unique(D.rows.map(function(r){return r.category;})), cat=node('select'); option(cat,'All categories','all'); cats.forEach(function(x){option(cat,x,x);}); cat.value=state.category; cat.addEventListener('change',function(){state.category=cat.value;renderBoard();}); c.append(control('Category',cat));
    var chains=unique(D.rows.reduce(function(a,r){return a.concat(r.chains||[]);},[])), chain=node('select'); option(chain,'All chains','all'); chains.forEach(function(x){option(chain,x,x);}); chain.value=state.chain; chain.addEventListener('change',function(){state.chain=chain.value;renderBoard();}); c.append(control('Chain',chain));
    var label=node('label','check'), check=node('input'); check.type='checkbox'; check.checked=state.watch; check.addEventListener('change',function(){state.watch=check.checked;renderBoard();}); label.append(check,node('span','','Watchlist only')); c.append(label); return c;
  }
  function selectedRows() {
    return D.rows.filter(function(r){ return (!state.q || r.name.toLowerCase().includes(state.q.toLowerCase())) && (state.category==='all'||r.category===state.category) && (state.chain==='all'||(r.chains||[]).includes(state.chain)) && (!state.watch||watch.has(r.slug)); }).sort(function(a,b){var x=a[state.sort],y=b[state.sort]; if(state.sort==='growth'){x=a.change_7d;y=b.change_7d;} if(state.sort==='chains_count'){x=(a.chains||[]).length;y=(b.chains||[]).length;} if(state.sort==='name'||state.sort==='category')return String(x||'').localeCompare(String(y||''))*state.dir; if(x==null)x=-Infinity;if(y==null)y=-Infinity; return (x-y)*state.dir;});
  }
  function sortButton(label,key) { var b=node('button','',label+(state.sort===key?(state.dir===1?' ↑':' ↓'):'')); b.addEventListener('click',function(){if(state.sort===key)state.dir=-state.dir;else{state.sort=key;state.dir=key==='rank'?1:-1;}renderBoard();}); return b; }
  function renderBoard() {
    var board=document.getElementById('board'); if(!board)return; board.replaceChildren(); var count=node('div','count',''); var rows=selectedRows(); count.textContent=rows.length+' / '+D.rows.length+' protocols'; board.append(sectionTitle('Ranked board','Select a protocol for its valuation breakdown and farm plan.',count),node('div','card',''));
    var card=board.lastChild; card.append(buildControls()); var wrap=node('div','table-wrap'), table=node('table'), head=node('thead'), tr=node('tr');
    [['Rank','rank'],['Protocol','name'],['Category','category'],['Chains','chains_count'],['TVL','tvl_usd'],['7-day','growth'],['Age','age_days'],['Implied value','implied_value_usd']].forEach(function(col){var th=node('th'); th.scope='col'; th.append(sortButton(col[0],col[1]));tr.append(th);}); head.append(tr); table.append(head);
    var body=node('tbody'); rows.forEach(function(r){var tr=node('tr');tr.tabIndex=0;tr.setAttribute('aria-label','Open '+r.name+' details');tr.addEventListener('click',function(){state.selected=r.slug;renderDetail(r);});tr.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();state.selected=r.slug;renderDetail(r);}});
      var vals=[r.rank,null,r.category||'Other',(r.chains||[]).length,usd(r.tvl_usd),pct(r.change_7d),age(r.age_days),usd(r.implied_value_usd)]; vals.forEach(function(v,i){var td=node('td',i===0||i>=3?'num':'',v==null?'':String(v));if(i===5&&r.change_7d!=null)td.classList.add(r.change_7d>=0?'pos':'neg');if(i===7)td.classList.add('value');if(i===1){td.className='protocol';td.textContent=r.name;if(watch.has(r.slug))td.append(node('span','watch','Watchlist'));}tr.append(td);}); body.append(tr);
    }); if(!rows.length){var empty=node('tr'),td=node('td','empty','No protocols match these filters.');td.colSpan=8;empty.append(td);body.append(empty);} table.append(body);wrap.append(table);card.append(wrap);
  }
  function renderDetail(r) {
    var board=document.getElementById('board'), existing=document.getElementById('detail'); if(existing)existing.remove(); if(!board)return;
    var box=node('section','card detail');box.id='detail';var back=node('button','back','← BACK TO BOARD');back.type='button';back.addEventListener('click',function(){box.remove();state.selected=null;document.getElementById('board').scrollIntoView({block:'start'});});
    var top=node('div','detail-top'),heading=node('div',''),k=node('div','kicker','Protocol detail · rank '+r.rank),h=node('h2','',r.name),sub=node('p','sub',(r.category||'Other')+' · '+(r.chains||[]).join(', '));heading.append(k,h,sub);top.append(heading,node('div','value num',usd(r.implied_value_usd)+' implied'));box.append(back,top);
    var grid=node('div','detail-grid');[['TVL',usd(r.tvl_usd)],['7-day change',pct(r.change_7d)],['Age without token',age(r.age_days)],['Chains',(r.chains||[]).length],['Category',r.category||'Other'],['Rank','#'+r.rank],['Ratio source',r.category_ratio_source==='global'?'Global median':'Category median · '+r.category_ratio_source],['Watchlist',watch.has(r.slug)?'Yes':'No']].forEach(function(x){var s=node('div','stat');s.append(node('span','',x[0]),node('b','',x[1]));grid.append(s);});box.append(grid);
    var deriv=node('div','detail-block'),dh=node('h3','','Implied value · step by step'),eq=node('div','equation');[['TVL × '+(r.category_ratio_source==='global'?'global median':'category median ('+r.category_ratio_source+')')+' ratio · '+usd(r.tvl_usd)+' × '+Number(r.category_ratio_used).toFixed(4),usd(r.base_usd)],['× growth multiplier · '+Number(r.growth_multiplier).toFixed(4),usd(r.base_usd*r.growth_multiplier)],['× maturity multiplier · '+Number(r.maturity_multiplier).toFixed(4),usd(r.base_usd*r.growth_multiplier*r.maturity_multiplier)],['× chain multiplier · '+Number(r.chain_multiplier).toFixed(4),usd(r.implied_value_usd)]].forEach(function(x){var line=node('div');line.append(node('span','',x[0]),node('b','',x[1]));eq.append(line);});var total=node('div','total');total.append(node('span','','Rounded model result'),node('b','',usd(r.implied_value_usd)));eq.append(total);deriv.append(dh,eq);box.append(deriv);
    var farm=node('div','detail-block'),fh=node('h3','','Farm plan · from snapshot data'),ol=node('ol','steps');(r.farm_steps||[]).forEach(function(s){ol.append(node('li','',s));});farm.append(fh,ol);box.append(farm);board.append(box);box.scrollIntoView({block:'start'});
  }
  function liveSection() {
    var section=node('section','live'),head=sectionTitle('Live-token calibration set','These protocols already trade, are not ranked, and show real market capitalization.',null);head.querySelector('p').classList.add('live-note');section.append(head);var card=node('div','card'),wrap=node('div','table-wrap'),table=node('table'),thead=node('thead'),tr=node('tr');[['Protocol'],['Category'],['Chains'],['TVL'],['Market cap'],['7-day']].forEach(function(x){var th=node('th','',x[0]);tr.append(th);});thead.append(tr);table.append(thead);var body=node('tbody');D.live.forEach(function(r){var tr=node('tr');[r.name,r.category||'Other',String((r.chains||[]).length),usd(r.tvl_usd),usd(r.mcap_usd),pct(r.change_7d)].forEach(function(v,i){var td=node('td',i>=2?'num':'',v);if(i===4)td.classList.add('value');tr.append(td);});body.append(tr);});table.append(body);wrap.append(table);card.append(wrap);section.append(card);return section;
  }
  setup();
}());
