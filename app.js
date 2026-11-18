/* Pickdi Talent Pool - renders into <div id="pt-root">. Config comes from window.PICKDI_TALENT. */
(function () {
  var CFG = window.PICKDI_TALENT || {};
  var API_URL = CFG.apiUrl || '';
  var FORM_URL = CFG.formUrl || 'https://docs.google.com/forms/d/1aotWFrVq6xxBkds3F635iThq-APoGi8uvk5B9d1tvZk/viewform?usp=pp_url&entry.2100853585=';
  var root = document.getElementById('pt-root');
  if (!root) return;

  var state = { all: [], q: '', field: new Set(), tier: new Set(), now: false, channel: new Set(), sort: 'avail', open: null };
  var TIER_ORDER = { '신입': 1, '스탠다드': 2, '프로': 3 };
  // 티어별 월 서비스 이용료 (부가세 별도, 월 21일·168시간 기준)
  var TIER_PRICE = [['신입', '99만원'], ['스탠다드', '139만원'], ['프로', '189만원']];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function list(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
  function lines(s) { return String(s || '').split('\n').map(function (x) { return x.replace(/^\s*[-•]\s*/, '').trim(); }).filter(Boolean); }
  function num(s) { var n = parseFloat(s); return isNaN(n) ? null : n; }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  function isNow(p) { return /즉시/.test(p.availability_label || ''); }
  // Google Analytics (GA4): events only carry Member ID and UI values, never names or contacts
  function track(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (err) {} }
  function profileParams(id) { var p = state.all.filter(function (x) { return x.member_id === id; })[0] || {}; return { member_id: id, tier: p.tier || '', job_title: p.job_title || '' }; }
  var searchTimer = null;
  function slug(id) { return String(id || '').toLowerCase().replace(/_/g, '-'); }
  function idFromSlug(s) { s = String(s || '').replace(/^#/, ''); return s.toUpperCase().replace(/^MEM-/, 'MEM_'); }

  function years(p) { var n = num(p.total_experience); return n ? '경력 ' + n + '년' : ''; }
  function months(p) {
    var n = num(p.months_at_pickdi); if (n == null) return '';
    if (n < 1) return '픽디 1개월 미만';
    if (n >= 12) { var y = Math.floor(n / 12), m = Math.round(n % 12); return '픽디 ' + y + '년' + (m ? ' ' + m + '개월' : ''); }
    return '픽디 ' + Math.round(n) + '개월';
  }

  /* ---------- load ---------- */
  function load() {
    if (CFG.data) return Promise.resolve(CFG.data);
    return fetch(API_URL, { redirect: 'follow' }).then(function (r) { return r.json(); });
  }

  function counts(key, splitter) {
    var m = {};
    state.all.forEach(function (p) { splitter(p[key]).forEach(function (v) { m[v] = (m[v] || 0) + 1; }); });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || a.localeCompare(b, 'ko'); }).map(function (k) { return [k, m[k]]; });
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var res = state.all.filter(function (p) {
      if (state.field.size && !list(p.field_tags).some(function (f) { return state.field.has(f); })) return false;
      if (state.tier.size && !state.tier.has(p.tier)) return false;
      if (state.channel.size && !list(p.channels).some(function (c) { return state.channel.has(c); })) return false;
      if (state.now && !isNow(p)) return false;
      if (q) {
        var hay = [p.job_title, p.field_tags, p.career_summary, p.client_history, p.self_intro, p.past_tasks, p.key_achievements, p.tools, p.channels, p.client_industries, p.name_en].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var by = {
      avail: function (a, b) { return String(a.available_from).localeCompare(String(b.available_from)); },
      exp: function (a, b) { return (num(b.total_experience) || 0) - (num(a.total_experience) || 0); },
      pickdi: function (a, b) { return (num(b.months_at_pickdi) || 0) - (num(a.months_at_pickdi) || 0); },
      tier: function (a, b) { return (TIER_ORDER[b.tier] || 0) - (TIER_ORDER[a.tier] || 0); }
    }[state.sort];
    return res.sort(by);
  }

  /* ---------- render ---------- */
  function chipGroup(title, key, entries, set) {
    if (!entries.length) return '';
    return '<div class="pt-fgroup"><h3>' + esc(title) + '</h3><div class="pt-chips">' + entries.map(function (e) {
      return '<button type="button" class="pt-chip" data-k="' + key + '" data-v="' + esc(e[0]) + '" aria-pressed="' + set.has(e[0]) + '">' +
        esc(e[0]) + '<span class="pt-n">' + e[1] + '</span></button>';
    }).join('') + '</div></div>';
  }

  function render() {
    var res = filtered();
    var nowCount = state.all.filter(isNow).length;
    var anyFilter = state.q || state.field.size || state.tier.size || state.channel.size || state.now;
    var filtersHtml =
      '<input class="pt-search" id="pt-q" type="search" placeholder="직무, 툴, 채널로 검색" value="' + esc(state.q) + '" aria-label="검색">' +
      chipGroup('분야', 'field', counts('field_tags', list), state.field) +
      chipGroup('등급', 'tier', counts('tier', function (v) { return v ? [v] : []; }).sort(function (a, b) { return (TIER_ORDER[a[0]] || 9) - (TIER_ORDER[b[0]] || 9); }), state.tier) +
      '<div class="pt-fgroup"><h3>업무 시작</h3><div class="pt-chips"><button type="button" class="pt-chip" data-k="now" aria-pressed="' + state.now + '">즉시 가능<span class="pt-n">' + nowCount + '</span></button></div></div>' +
      chipGroup('채널 경험', 'channel', counts('channels', list), state.channel) +
      (anyFilter ? '<button type="button" class="pt-reset" data-k="reset">필터 초기화</button>' : '');

    var rows = res.length ? res.map(rowHtml).join('') :
      (state.all.length ? '<div class="pt-empty">조건에 맞는 인재가 없습니다. 필터를 줄여 보세요.</div>' : '<div class="pt-empty">현재 소개 가능한 인재를 준비하고 있습니다. 곧 업데이트됩니다.</div>');

    var lastUpdate = state.updated || state.all.map(function (x) { return String(x.last_updated || ''); }).sort().pop() || '';
    root.innerHTML =
      '<div class="pt-wrap">' +
        '<header class="pt-head"><div><p class="pt-eyebrow">PICKDI TALENT POOL</p>' +
          '<h1 class="pt-title">픽디 탤런트 풀</h1>' +
          '<p class="pt-lead">매칭 가능한 픽디 인력 풀을 소개합니다. 모두 픽디를 통해 한국 고객사와 실제로 업무한 경험이 있습니다. 고객사에 적합한 인재를 찾고, 매칭을 신청해 보세요.</p>' +
          '<p class="pt-disclaimer">' + (lastUpdate ? '최종 업데이트 ' + esc(lastUpdate.replace(/-/g, '.')) + ' · ' : '') + '최종 가능 여부와 일정은 매칭 신청 후 다시 확인해드립니다.</p></div>' +
          '<div class="pt-facts"><div class="pt-fact"><b>' + state.all.length + '</b><span>등록 인재</span></div>' +
          '<div class="pt-fact"><b>' + nowCount + '</b><span>즉시 가능</span></div></div></header>' +
        '<div class="pt-grid">' +
          '<aside class="pt-filters" aria-label="필터">' + mobileWrap(filtersHtml) + '</aside>' +
          '<section aria-label="인재 목록"><div class="pt-bar"><span><b>' + res.length + '</b>명</span>' +
            '<label>정렬 <select id="pt-sort">' +
              opt('avail', '업무 가능일 빠른 순') + opt('exp', '경력 많은 순') + opt('pickdi', '픽디 경력 많은 순') + opt('tier', '등급 높은 순') +
            '</select></label></div><div class="pt-list">' + rows + '</div></section>' +
        '</div>' +
      '</div>' + (state.open ? detailHtml(state.open) : '');

  }
  function opt(v, label) { return '<option value="' + v + '"' + (state.sort === v ? ' selected' : '') + '>' + label + '</option>'; }
  function mobileWrap(html) {
    return window.matchMedia('(max-width: 860px)').matches
      ? '<details' + (state.mobileOpen ? ' open' : '') + ' id="pt-fdetails"><summary>필터</summary><div style="display:flex;flex-direction:column;gap:18px;margin-top:14px">' + html + '</div></details>'
      : html;
  }

  function langText(p) {
    var w = list(p.work_languages), s = list(p.speaking_languages);
    var parts = [];
    if (w.length) parts.push('업무 ' + w.join(', '));
    if (s.length) parts.push('회의 ' + s.join(', '));
    if (parts.length) return parts.join(' · ');
    return String(p.language_notes || '').split(/[.。]/)[0];
  }
  function careerLines(p) {
    var pickdi = String(p.client_history || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean)
      .map(function (h) { return '픽디 고객사 ' + h.replace(/\s+(\d{4}\.\d{2})\s*–\s*(\d{4}\.\d{2})$/, ' ($1~$2)'); });
    return pickdi.concat(lines(p.career_summary).map(function (s) { return String(s).replace(/^[\s·•\-–]+/, ''); }).filter(Boolean));
  }
  function langs(v) { return list(v).join(', '); }
  // 인재 정보 마지막 업데이트일 (Profiles Z열, 없으면 상태 변경일)
  function updatedOn(p) {
    var d = String(p.availability_confirmed_on || p.last_updated || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.replace(/-/g, '.') : '';
  }
  // 픽디 추천 점수 (0.0–5.0) → 별점
  function score(p) { var n = parseFloat(p.pickdi_score); return isFinite(n) && n > 0 ? Math.min(5, Math.round(n * 10) / 10) : null; }
  function stars(p, big) {
    var n = score(p); if (n === null) return '';
    return '<span class="pt-stars' + (big ? ' pt-stars-lg' : '') + '" role="img" aria-label="픽디 추천 점수 5점 만점에 ' + n.toFixed(1) + '점" title="픽디 추천 점수">' +
      '<span class="pt-stars-bg" aria-hidden="true">★★★★★<span class="pt-stars-fg" style="width:' + (n / 5 * 100) + '%">★★★★★</span></span>' +
      '<b>' + n.toFixed(1) + '</b></span>';
  }
  function busy(p) { return String(p.in_discussion).toUpperCase() === 'TRUE'; }
  function availBadge(p) {
    return busy(p) ? '<span class="pt-badge pt-badge-wait">다른 고객사와 논의 중</span>'
      : '<span class="pt-badge pt-badge-ok">' + esc(p.availability_label || '') + '</span>';
  }
  function tierBadge(p) { return p.tier ? '<span class="pt-badge pt-badge-tier pt-tier-' + (TIER_ORDER[p.tier] || 0) + '" title="픽디 추천 등급">' + esc(p.tier) + '</span>' : ''; }

  function rowHtml(p) {
    var tags = list(p.field_tags).map(function (t) { return '<span class="pt-tag pt-tag-strong">' + esc(t) + '</span>'; }).join('') +
      list(p.channels).slice(0, 4).map(function (t) { return '<span class="pt-tag">' + esc(t) + '</span>'; }).join('');
    var exp = [num(p.total_experience) ? '총 ' + p.total_experience + '년' : '', months(p)].filter(Boolean).join(' · ');
    var career = careerLines(p).slice(0, 3);
    var facts =
      '<div class="pt-facts-row">' +
        (exp ? '<div><dt>경력</dt><dd>' + esc(exp) + '</dd></div>' : '') +
        '<div><dt>업무 가능 언어</dt><dd>' + (langs(p.work_languages) ? esc(langs(p.work_languages)) : '<span class="pt-muted">확인 중</span>') + '</dd></div>' +
        '<div><dt>회화 가능 언어</dt><dd>' + (langs(p.speaking_languages) ? esc(langs(p.speaking_languages)) : '<span class="pt-muted">확인 중</span>') + '</dd></div>' +
      '</div>' +
      (career.length ? '<div class="pt-career"><dt>주요 경력</dt><dd><ul>' + career.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></dd></div>' : '');
    return '<button type="button" class="pt-row" data-open="' + esc(p.member_id) + '">' +
      '<div class="pt-row-top"><div class="pt-row-head"><p class="pt-row-title">' + esc(p.job_title) + '</p>' + tierBadge(p) + '</div>' + availBadge(p) + '</div>' +
      '<span class="pt-row-name">' + esc(p.name_en) + (p.name_vn ? ' · ' + esc(p.name_vn) : '') + '</span>' + '<div class="pt-row-sub">' + stars(p) + '</div>' +
      '<dl class="pt-rowfacts">' + facts + '</dl>' +
      '<div class="pt-meta">' + tags + '</div>' +
    '</button>';
  }

  function tierInfo(p) {
    if (!p.tier) return '';
    var rows = TIER_PRICE.map(function (t) {
      return '<li' + (t[0] === p.tier ? ' class="pt-on"' : '') + '><span>' + esc(t[0]) + '</span><b>월 ' + esc(t[1]) + '</b></li>';
    }).join('');
    return '<span class="pt-tip"><button type="button" class="pt-tip-btn" aria-label="등급별 서비스 이용료 보기" aria-expanded="false" data-tip="1">i</button>' +
      '<span class="pt-tip-pop" role="tooltip"><strong>등급별 월 서비스 이용료</strong><ul>' + rows + '</ul>' +
      '<small>부가세 별도 · 월 21일(168시간) 기준 · 실제 근무 시간만큼 청구</small></span></span>';
  }

  function sec(title, body, cls) { return body ? '<section class="pt-sec' + (cls ? ' ' + cls : '') + '"><h3>' + esc(title) + '</h3>' + body + '</section>' : ''; }
  function ul(s) { var l = lines(s); return l.length ? '<ul>' + l.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  function para(s) { return s ? '<p>' + esc(s) + '</p>' : ''; }
  // "- " / "• " 로 시작하는 줄은 동그라미 목록으로, 나머지는 문단으로
  function rich(s) {
    if (!s) return '';
    var out = '', items = [];
    String(s).split(/\n/).forEach(function (line) {
      var m = line.match(/^\s*[-•·*]\s+(.*)$/);
      if (m) { items.push(m[1]); return; }
      if (items.length) { out += '<ul>' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; items = []; }
      if (line.trim()) out += '<p>' + esc(line) + '</p>';
    });
    if (items.length) out += '<ul>' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    return out;
  }
  function file(url, label, sub, ga) { url = safeUrl(url); return url ? '<a class="pt-file" data-ga="' + esc(ga || 'file') + '" href="' + esc(url) + '" target="_blank" rel="noopener"><span><b>' + esc(label) + '</b>' + (sub ? '<br><small>' + esc(sub) + '</small>' : '') + '</span><span aria-hidden="true">↗</span></a>' : ''; }

  function detailHtml(id) {
    var p = state.all.filter(function (x) { return x.member_id === id; })[0];
    if (!p) return '';
    var isBusy = busy(p);
    var history = String(p.client_history || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean).map(function (h) {
      var m = h.match(/^(.*?)\s+(\d{4}\.\d{2}\s*–\s*\d{4}\.\d{2})$/);
      return '<li><span>' + esc(m ? m[1] : h) + '</span><span>' + esc(m ? m[2] : '') + '</span></li>';
    }).join('');
    var kv = [
      ['등급', p.tier], ['업무 시작', p.availability_label, updatedOn(p) ? updatedOn(p) + ' 업데이트' : ''],
      ['총 경력', num(p.total_experience) ? p.total_experience + '년' : ''], ['픽디 협업', months(p).replace('픽디 ', '')],
      ['업무 가능 언어', langs(p.work_languages) || '확인 중'], ['회화 가능 언어', langs(p.speaking_languages) || '확인 중'],
      ['툴', p.tools], ['채널 경험', p.channels], ['산업 경험', p.client_industries]
    ].filter(function (x) { return x[1]; }).map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + (x[2] ? ' <small class="pt-kv-sub">' + esc(x[2]) + '</small>' : '') + '</dd></div>'; }).join('');
    var files = file(p.cv_url, '이력서 보기', '개인 연락처는 가려져 있습니다', 'cv') +
      file(p.portfolio_url, '포트폴리오', '', 'portfolio') +
      String(p.extra_portfolio || '').split(/[\s,]+/).map(function (u, i) { return file(u, '추가 포트폴리오' + (i ? ' ' + (i + 1) : ''), '', 'extra_portfolio'); }).join('') +
      '';
    var hireFiles = file(p.assignment_url, p.assignment_title || '채용 과제', '픽디 채용 과정 과제', 'assignment') +
      file(p.interview_url, p.interview_title || '면접 기록', '픽디 채용 과정 면접', 'interview');

    return '<div class="pt-scrim" data-close="1"></div>' +
      '<aside class="pt-sheet" role="dialog" aria-modal="true" aria-labelledby="pt-d-title">' +
        '<div class="pt-sheet-top"><span class="pt-note">' + esc(p.member_id) + '</span><button type="button" class="pt-x" data-close="1">닫기</button></div>' +
        '<div class="pt-sheet-body">' +
          '<div class="pt-d-head"><div class="pt-row-top"><div class="pt-meta">' +
            list(p.field_tags).map(function (t) { return '<span class="pt-tag pt-tag-strong">' + esc(t) + '</span>'; }).join('') +
          '</div>' + availBadge(p) + '</div><div class="pt-row-head"><h2 id="pt-d-title">' + esc(p.job_title) + '</h2>' + tierBadge(p) + tierInfo(p) + '</div>' +
          '<div class="pt-d-name">' + esc(p.name_en) + (p.name_vn ? ' · ' + esc(p.name_vn) : '') + '</div>' +
          '<div class="pt-cta"><a class="pt-btn pt-btn-primary" data-ga="match_request" href="' + esc(FORM_URL + encodeURIComponent(p.member_id)) + '" target="_blank" rel="noopener">이 인재로 매칭 신청</a>' +
            (safeUrl(p.cv_url) ? '<a class="pt-btn" data-ga="cv" href="' + esc(safeUrl(p.cv_url)) + '" target="_blank" rel="noopener">이력서 보기</a>' : '') + '</div>' +
          '<p class="pt-note" style="margin-top:10px">' + (updatedOn(p) ? esc(updatedOn(p)) + ' 기준의 정보입니다. ' : '') + '최종 가능 여부와 일정은 매칭 신청 후 다시 확인해드립니다.</p>' +
          (isBusy ? '<p class="pt-note" style="margin-top:6px">지금 다른 고객사와 논의 중입니다. 신청하시면 대기 순서로 접수되고, 진행이 끝나는 대로 연락드립니다.</p>' : '') +
          '</div>' +
          '<dl class="pt-kv">' + kv + '</dl>' +
          sec('자기소개', rich(p.self_intro), 'pt-intro') +
          sec('픽디 코멘트', (score(p) !== null ? '<p class="pt-score-line">픽디 추천 점수 <b>' + score(p).toFixed(1) + '점</b> <small>/ 5점</small> ' + stars(p, true) + '</p>' : '') + rich(p.pickdi_comment), 'pt-quote') +
          sec('주요 경력', ul(careerLines(p).join('\n'))) +
          sec('주요 업무', ul(p.past_tasks)) +
          sec('주요 성과', ul(p.key_achievements)) +
          sec('언어 추가 정보', rich(p.language_notes)) +
          sec('이전 계약 종료 사유', para(p.end_reason)) +
          sec('이력서·포트폴리오', files ? '<div class="pt-files">' + files + '</div>' : '', 'pt-card') +
          sec('채용 정보', (para(p.hiring_eval_summary) + (hireFiles ? '<div class="pt-files" style="margin-top:12px">' + hireFiles + '</div>' : '')), 'pt-card') +
          '<p class="pt-note">최근 업데이트 ' + esc(p.last_updated) + ' · 고객사명은 일부 가려서 표시합니다.</p>' +
        '</div></aside>';
  }

  /* ---------- events ---------- */
  root.addEventListener('click', function (e) {
    var tip = e.target.closest('[data-tip]');
    if (tip) { var w = tip.parentNode; var on = !w.classList.contains('pt-tip-open'); w.classList.toggle('pt-tip-open', on); tip.setAttribute('aria-expanded', on); if (on) track('tier_price_open', profileParams(state.open)); return; }
    var ga = e.target.closest('a[data-ga]');
    if (ga) {
      var params = profileParams(state.open);
      if (ga.dataset.ga === 'match_request') track('match_request_click', params);
      else { params.file_type = ga.dataset.ga; track('file_open', params); }
      return;
    }
    var t = e.target.closest('[data-k],[data-open],[data-close]');
    if (!t) return;
    if (t.dataset.open) return openDetail(t.dataset.open);
    if (t.dataset.close) return openDetail(null);
    var k = t.dataset.k, v = t.dataset.v;
    var d = root.querySelector('#pt-fdetails'); state.mobileOpen = d ? d.open : false;
    track('filter_use', { filter_type: k, filter_value: v || '' });
    if (k === 'reset') { state.q = ''; state.field.clear(); state.tier.clear(); state.channel.clear(); state.now = false; }
    else if (k === 'now') state.now = !state.now;
    else { var set = state[k]; set.has(v) ? set.delete(v) : set.add(v); }
    render();
  });
  root.addEventListener('input', function (e) {
    if (e.target.id !== 'pt-q') return;
    state.q = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { if (state.q.trim()) track('search', { search_term: state.q.trim() }); }, 1200);
    var pos = e.target.selectionStart;
    render();
    var q = root.querySelector('#pt-q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (err) {} }
  });
  root.addEventListener('change', function (e) {
    if (e.target.id === 'pt-sort') { state.sort = e.target.value; track('sort_change', { sort_by: state.sort }); render(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) openDetail(null); });

  function openDetail(id) {
    state.open = id;
    if (id) track('view_profile', Object.assign(profileParams(id), { source: 'list' }));
    try { history.replaceState(null, '', id ? '#' + slug(id) : location.pathname + location.search); } catch (err) {}
    document.documentElement.style.overflow = id ? 'hidden' : '';
    render();
    if (id) { var x = root.querySelector('.pt-x'); if (x) x.focus(); }
  }
  window.addEventListener('hashchange', function () {
    var id = location.hash ? idFromSlug(location.hash) : null;
    if (id !== state.open) { state.open = id && state.all.some(function (p) { return p.member_id === id; }) ? id : null; render(); }
  });

  root.innerHTML = '<div class="pt-wrap"><p class="pt-loading">인재 목록을 불러오는 중입니다…</p></div>';
  load().then(function (json) {
    state.all = (json && json.profiles) || [];
    var fromQuery = (location.search.match(/[?&]id=([^&]+)/) || [])[1];
    var id = fromQuery ? decodeURIComponent(fromQuery).toUpperCase() : (location.hash ? idFromSlug(location.hash) : null);
    if (id && state.all.some(function (p) { return p.member_id === id; })) { state.open = id; track('view_profile', Object.assign(profileParams(id), { source: 'direct_link' })); }
    track('talent_list_loaded', { profile_count: state.all.length });
    render();
  }).catch(function () {
    root.innerHTML = '<div class="pt-wrap"><div class="pt-empty">인재 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요. 계속 안 되면 픽디 담당 매니저에게 알려주세요.</div></div>';
  });
})();
