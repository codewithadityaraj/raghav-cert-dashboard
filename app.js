/* ══════════════════════════════════════════════════
   UNI PROGRAM DASHBOARD — app.js
   CSV-backed dynamic dashboard integration
   ══════════════════════════════════════════════════ */

'use strict';

const DATA_SOURCES = {
  fullPaymentCohort: 'fullPaymentCohort',
  fullPaymentMonthly: 'fullPaymentMonthly',
  tlCohort: 'tlCohort',
  tlMonthly: 'tlMonthly',
  gmCohort: 'gmCohort',
  gmMonthly: 'gmMonthly',
  bdaCohort: 'bdaCohort',
  bdaMonthly: 'bdaMonthly'
};

const csvCache = new Map();
const state = {
  isLoading: true,
  hasError: false,
  activeProgram: 'ALL',
  sectionCohortFilters: { fc: 'ALL' },
  sectionMonthFilters: { fm: 'ALL' },
  leaderFilters: { 'tl-fc': 'ALL', 'tl-fm': 'ALL', 'gm-fc': 'ALL', 'gm-fm': 'ALL', 'bda-fc': 'ALL', 'bda-fm': 'ALL' },
  leaderCohortFilters: { 'tl-fc': 'ALL', 'gm-fc': 'ALL', 'bda-fc': 'ALL' },
  leaderMonthFilters: { 'tl-fm': 'ALL', 'gm-fm': 'ALL', 'bda-fm': 'ALL' },
  leaderSorts: {
    'tl-fc': 'ach-desc', 'tl-fm': 'ach-desc', 'gm-fc': 'ach-desc', 'gm-fm': 'ach-desc',
    'bda-fc': 'ach-desc', 'bda-fm': 'ach-desc'
  }
};

const datasets = {
  fullPaymentCohort: [],
  fullPaymentMonthly: [],
  tlCohort: [],
  tlMonthly: [],
  gmCohort: [],
  gmMonthly: [],
  bdaCohort: [],
  bdaMonthly: []
};

function fmt(n) { return Math.round(Number(n) || 0).toLocaleString('en-IN'); }
function fmtRs(n) {
  n = Math.round(Number(n) || 0);
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
  return '₹' + n.toLocaleString('en-IN');
}
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function progressColor(p) { return p >= 90 ? 'accent-green' : (p >= 70 ? 'accent-amber' : 'accent-red'); }
function trendClass(v) { return v >= 0 ? 'up' : 'down'; }
function trendLabel(v) { return (v >= 0 ? '↑' : '↓') + ' ' + Math.abs(v).toFixed(1) + '%'; }
function safeString(v) { return (v == null ? '' : String(v)).trim(); }
function toNumber(v) {
  const parsed = parseFloat(safeString(v).replace(/[,%₹,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function toPercent(v) {
  const raw = toNumber(v);
  return clamp(raw, 0, 9999);
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function firstDefined(row, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    if (row[key] != null && safeString(row[key])) return row[key];
  }
  return '';
}
function uniqueValues(rows, key) {
  const set = new Set();
  rows.forEach((row) => {
    const value = safeString(firstDefined(row, key));
    if (value) set.add(value);
  });
  return Array.from(set);
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const splitRow = (line) => {
    const out = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        out.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    out.push(current);
    return out.map((cell) => cell.trim());
  };
  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitRow(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx] == null ? '' : cols[idx];
    });
    return row;
  }).filter((row) => Object.values(row).some((val) => safeString(val)));
}

async function fetchCSV(sheetKey) {
  if (csvCache.has(sheetKey)) return csvCache.get(sheetKey);
  const promise = (async () => {
    const functionUrl = `/api/sheets?sheet=${encodeURIComponent(sheetKey)}`;
    const response = await fetch(functionUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Function fetch failed: ${response.status}`);
    const payload = await response.json();
    if (!payload || !payload.csv) throw new Error('Invalid function payload');
    return parseCSV(payload.csv);
  })();
  csvCache.set(sheetKey, promise);
  return promise;
}

function filterData(rows, keyOrMap, value) {
  if (Array.isArray(keyOrMap)) {
    const roleKeys = keyOrMap;
    const selected = value;
    return rows.filter((row) => {
      if (selected === 'ALL') return true;
      return roleKeys.some((key) => safeString(firstDefined(row, key)) === safeString(selected));
    });
  }
  const conditions = keyOrMap;
  return rows.filter((row) => Object.entries(conditions).every(([key, val]) => {
    if (val === 'ALL') return true;
    return safeString(firstDefined(row, key)) === safeString(val);
  }));
}

function populateDropdown(selectId, values, allLabel) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const selected = select.value || 'ALL';
  const unique = Array.from(new Set(values.filter(Boolean)));
  const options = ['<option value="ALL">' + allLabel + '</option>']
    .concat(unique.map((value) => `<option value="${value}">${value}</option>`));
  select.innerHTML = options.join('');
  select.value = unique.includes(selected) || selected === 'ALL' ? selected : 'ALL';
}

function getAllPrograms() {
  const all = uniqueValues(datasets.fullPaymentCohort, 'Program Name')
    .concat(uniqueValues(datasets.fullPaymentMonthly, 'Program Name'))
    .filter((v, i, arr) => arr.indexOf(v) === i);
  return all.sort((a, b) => a.localeCompare(b));
}

function updateProgressBars(targets) {
  targets.forEach(({ id, pct }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.transition = 'width 350ms ease';
    el.style.width = `${clamp(pct, 0, 100)}%`;
    el.className = `card-progress-fill ${progressColor(pct)}`;
  });
}

function updatePlaceholders(prefix, row) {
  const target = toNumber(row.target);
  const achieved = toNumber(row.achieved);
  const targetRev = toNumber(row.revTarget);
  const achievedRev = toNumber(row.revAchieved);
  const percent = row.percent > 0 ? row.percent : (target ? (achieved / target) * 100 : 0);
  const revPercent = row.revPercent > 0 ? row.revPercent : (targetRev ? (achievedRev / targetRev) * 100 : 0);

  setText(`card-${prefix}-tgt`, fmt(target));
  setText(`card-${prefix}-ach`, fmt(achieved));
  setText(`card-${prefix}-pct`, `${percent.toFixed(1)}%`);
  setText(`card-${prefix}-revtgt`, fmtRs(targetRev));
  setText(`card-${prefix}-revach`, fmtRs(achievedRev));
  setText(`card-${prefix}-revpct`, `${revPercent.toFixed(1)}%`);
  setText(`trend-${prefix}-ach`, trendLabel(percent - 75));
  setText(`trend-${prefix}-rev`, trendLabel(revPercent - 70));
  const trendAch = document.getElementById(`trend-${prefix}-ach`);
  const trendRev = document.getElementById(`trend-${prefix}-rev`);
  if (trendAch) trendAch.className = `trend-badge ${trendClass(percent - 75)}`;
  if (trendRev) trendRev.className = `trend-badge ${trendClass(revPercent - 70)}`;

  updateProgressBars([
    { id: `prog-${prefix}-ach`, pct: percent },
    { id: `prog-${prefix}-pct`, pct: percent },
    { id: `prog-${prefix}-rev`, pct: revPercent },
    { id: `prog-${prefix}-revpct`, pct: revPercent }
  ]);
}

function aggregateCardRows(rows, map) {
  if (!rows.length) {
    return { target: 0, achieved: 0, percent: 0, revTarget: 0, revAchieved: 0, revPercent: 0 };
  }
  const acc = rows.reduce((sum, row) => ({
    target: sum.target + toNumber(firstDefined(row, map.target)),
    achieved: sum.achieved + toNumber(firstDefined(row, map.achieved)),
    revTarget: sum.revTarget + toNumber(firstDefined(row, map.revTarget)),
    revAchieved: sum.revAchieved + toNumber(firstDefined(row, map.revAchieved))
  }), { target: 0, achieved: 0, revTarget: 0, revAchieved: 0 });

  const first = rows[0];
  return {
    target: acc.target,
    achieved: acc.achieved,
    percent: toPercent(firstDefined(first, map.percent)),
    revTarget: acc.revTarget,
    revAchieved: acc.revAchieved,
    revPercent: toPercent(firstDefined(first, map.revPercent))
  };
}

function renderTableRows(containerId, rows, config) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px;">No records found</div>';
    return;
  }

  // achievementOnly mode: just show name + achieved number, no bar or target
  if (config.achievementOnly) {
    container.innerHTML = rows.map((row, idx) => {
      const name     = safeString(firstDefined(row, config.name)) || 'NA';
      const achieved = toNumber(firstDefined(row, config.achieved));
      const stripeBg = idx % 2 ? 'rgba(127,127,127,0.03)' : 'transparent';
      return '<div class="leader-progress-row" style="background:' + stripeBg + ';border-radius:8px;padding:10px 14px;' +
        'display:flex;align-items:center;justify-content:space-between;transition:background 200ms ease;">' +
        '<span class="leader-row-name" style="flex:1;min-width:0;">' + escapeHtml(name) + '</span>' +
        '<span style="font-size:14px;font-weight:800;color:var(--text);font-family:\'DM Mono\',monospace;flex-shrink:0;">' +
        fmt(achieved) + '</span>' +
        '</div>';
    }).join('');
    return;
  }

  // Full mode: name + progress bar + achieved/target (%)
  container.innerHTML = rows.map((row, idx) => {
    const name     = safeString(firstDefined(row, config.name)) || 'NA';
    const target   = toNumber(firstDefined(row, config.target));
    const achieved = toNumber(firstDefined(row, config.achieved));
    const progress = toPercent(firstDefined(row, config.progress)) || (target ? (achieved / target) * 100 : 0);
    const stripeBg = idx % 2 ? 'rgba(127,127,127,0.03)' : 'transparent';
    return '<div class="leader-progress-row" style="background:' + stripeBg + ';border-radius:8px;padding:8px;transition:background 200ms ease;">' +
      '<div class="leader-row-name-wrap"><span class="leader-row-name" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</span></div>' +
      '<div class="leader-row-bar-container"><div class="leader-slim-track">' +
      '<div class="leader-slim-fill ' + config.colorClass + '" style="width:' + clamp(progress, 0, 100) + '%;transition:width 350ms ease;"></div>' +
      '</div></div>' +
      '<div class="leader-row-values">' + fmt(achieved) + '/' + fmt(target) + ' (' + progress.toFixed(1) + '%)</div>' +
      '</div>';
  }).join('');
}

const LEADER_TABLE_CONFIG = {
  'tl-fc': {
    dataset: 'tlCohort',
    role: ['TL Name', 'TL NAME'],
    cohort: true,
    config: {
      name: ['TL Name', 'TL NAME'],
      target: 'Cohort TL Full Payment Target',
      achieved: 'Cohort TL Full Payment Achieved',
      progress: 'Cohort TL Full Payment Achievement %',
      colorClass: 'color-fp-cohort',
      achievementOnly: true
    }
  },
  'tl-fm': {
    dataset: 'tlMonthly',
    role: ['TL Name', 'TL NAME'],
    cohort: false,
    config: {
      name: ['TL Name', 'TL NAME'],
      target: 'Month TL Full Payment Target',
      achieved: 'Month TL Full Payment Achieved',
      progress: 'Month TL Full Payment Achievement %',
      colorClass: 'color-fp-monthly',
      achievementOnly: true
    }
  },
  'gm-fc': {
    dataset: 'gmCohort',
    role: ['GM Name', 'GM NAME', 'GM'],
    cohort: true,
    config: {
      name: ['GM Name', 'GM NAME', 'GM'],
      target: 'GM Cohort Full Payment Target',
      achieved: 'GM Cohort Full Payment Achieved',
      progress: 'GM Cohort Full Payment Achievement %',
      colorClass: 'color-fp-cohort'
    }
  },
  'gm-fm': {
    dataset: 'gmMonthly',
    role: ['GM Name', 'GM NAME', 'GM'],
    cohort: false,
    config: {
      name: ['GM Name', 'GM NAME', 'GM'],
      target: 'GM Month Full Payment Target',
      achieved: 'GM Month Full Payment Achieved',
      progress: 'GM Month Full Payment Achievement %',
      colorClass: 'color-fp-monthly'
    }
  },
  'bda-fc': {
    dataset: 'bdaCohort',
    role: ['BDA Name', 'BDA'],
    cohort: true,
    config: {
      name: ['BDA Name', 'BDA'],
      target: 'BDA Cohort Full Payment Target',
      achieved: 'BDA Cohort Full Payment Achieved',
      progress: 'BDA Cohort Full Payment Achievement %',
      colorClass: 'color-fp-cohort',
      achievementOnly: true
    }
  },
  'bda-fm': {
    dataset: 'bdaMonthly',
    role: ['BDA Name', 'BDA'],
    cohort: false,
    config: {
      name: ['BDA Name', 'BDA'],
      target: 'BDA Month Full Payment Target',
      achieved: 'BDA Month Full Payment Achieved',
      progress: 'BDA Month Full Payment Achievement %',
      colorClass: 'color-fp-monthly',
      achievementOnly: true
    }
  }
};

function renderProgressTable(chartKey) {
  const table = LEADER_TABLE_CONFIG[chartKey];
  if (!table) return;

  const { role, cohort, config } = table;
  const sourceRows = datasets[table.dataset] || [];
  const base = filterData(sourceRows, { 'Program Name': state.activeProgram });
  const withPeriod = cohort
    ? filterData(base, { 'Cohort Name': state.leaderCohortFilters[chartKey] })
    : filterData(base, { Month: state.leaderMonthFilters[chartKey] });
  const withLeader = filterData(withPeriod, role, state.leaderFilters[chartKey]);

  const sortVal = state.leaderSorts[chartKey];
  const achKey = config.achieved;
  withLeader.sort((a, b) => {
    if (sortVal === 'name-asc') return safeString(firstDefined(a, role)).localeCompare(safeString(firstDefined(b, role)));
    if (sortVal === 'ach-asc') return toNumber(firstDefined(a, achKey)) - toNumber(firstDefined(b, achKey));
    return toNumber(firstDefined(b, achKey)) - toNumber(firstDefined(a, achKey));
  });

  // Hide the "Progress" header column for achievementOnly sections
  const listEl   = document.getElementById('list-' + chartKey);
  const headerEl = listEl && listEl.previousElementSibling;
  if (headerEl && headerEl.classList.contains('leader-list-header')) {
    const barHeader = headerEl.querySelector('.leader-list-header-bar');
    const valHeader = headerEl.querySelector('.leader-list-header-val');
    if (config.achievementOnly) {
      if (barHeader) barHeader.style.display = 'none';
      if (valHeader) valHeader.textContent = 'Achievement';
    } else {
      if (barHeader) barHeader.style.display = '';
      if (valHeader) valHeader.textContent = 'Achievement';
    }
  }

  renderTableRows('list-' + chartKey, withLeader, config);
}

function renderCards(prefix) {
  if (prefix === 'fc') {
    const rows = filterData(
      datasets.fullPaymentCohort,
      { 'Program Name': state.activeProgram, 'Cohort Name': state.sectionCohortFilters.fc }
    );
    updatePlaceholders(prefix, aggregateCardRows(rows, {
      target: 'Cohort Enrollment Target',
      achieved: 'Cohort Enrollment Acheived',
      percent: 'Cohort Enrollment Acheivement %',
      revTarget: 'Cohort Enrollment Revenue Target',
      revAchieved: 'Cohort Enrollment Revenue Acheived',
      revPercent: 'Cohort Enrollment Revenue Acheivement %'
    }));
  } else {
    const rows = filterData(
      datasets.fullPaymentMonthly,
      { 'Program Name': state.activeProgram, Month: state.sectionMonthFilters.fm }
    );
    updatePlaceholders(prefix, aggregateCardRows(rows, {
      target: 'Month Enrollment Target',
      achieved: 'Month Enrollment Acheived',
      percent: 'Month Enrollment Acheivement %',
      revTarget: 'Month Enrollment Revenue Target',
      revAchieved: 'Month Enrollment Revenue Acheived',
      revPercent: 'Month Enrollment Revenue Acheivement %'
    }));
  }
}

function updateDependentDropdowns() {
  const cohortRows = filterData(datasets.fullPaymentCohort, { 'Program Name': state.activeProgram });
  const monthlyRows = filterData(datasets.fullPaymentMonthly, { 'Program Name': state.activeProgram });
  const tlCohortRows = filterData(datasets.tlCohort, { 'Program Name': state.activeProgram });
  const tlMonthRows = filterData(datasets.tlMonthly, { 'Program Name': state.activeProgram });
  const gmCohortRows = filterData(datasets.gmCohort, { 'Program Name': state.activeProgram });
  const gmMonthRows = filterData(datasets.gmMonthly, { 'Program Name': state.activeProgram });
  const bdaCohortRows = filterData(datasets.bdaCohort, { 'Program Name': state.activeProgram });
  const bdaMonthRows = filterData(datasets.bdaMonthly, { 'Program Name': state.activeProgram });

  populateDropdown('select-sec-fc-cohort', uniqueValues(cohortRows, 'Cohort Name'), 'All Cohorts');
  populateDropdown('select-sec-fm-month', uniqueValues(monthlyRows, 'Month'), 'All Months');
  populateDropdown('select-tl-fc-cohort', uniqueValues(tlCohortRows, 'Cohort Name'), 'All Cohorts');
  populateDropdown('select-gm-fc-cohort', uniqueValues(gmCohortRows, 'Cohort Name'), 'All Cohorts');
  populateDropdown('select-bda-fc-cohort', uniqueValues(bdaCohortRows, 'Cohort Name'), 'All Cohorts');
  populateDropdown('select-tl-fm-month', uniqueValues(tlMonthRows, 'Month'), 'All Months');
  populateDropdown('select-gm-fm-month', uniqueValues(gmMonthRows, 'Month'), 'All Months');
  populateDropdown('select-bda-fm-month', uniqueValues(bdaMonthRows, 'Month'), 'All Months');

  const tlFcRows = filterData(tlCohortRows, { 'Cohort Name': state.leaderCohortFilters['tl-fc'] });
  const tlFmRows = filterData(tlMonthRows, { Month: state.leaderMonthFilters['tl-fm'] });
  const gmFcRows = filterData(gmCohortRows, { 'Cohort Name': state.leaderCohortFilters['gm-fc'] });
  const gmFmRows = filterData(gmMonthRows, { Month: state.leaderMonthFilters['gm-fm'] });
  const bdaFcRows = filterData(bdaCohortRows, { 'Cohort Name': state.leaderCohortFilters['bda-fc'] });
  const bdaFmRows = filterData(bdaMonthRows, { Month: state.leaderMonthFilters['bda-fm'] });

  populateDropdown('select-tl-fc', uniqueValues(tlFcRows, ['TL Name', 'TL NAME']), 'All TLs');
  populateDropdown('select-tl-fm', uniqueValues(tlFmRows, ['TL Name', 'TL NAME']), 'All TLs');
  populateDropdown('select-gm-fc', uniqueValues(gmFcRows, ['GM Name', 'GM NAME', 'GM']), 'All GMs');
  populateDropdown('select-gm-fm', uniqueValues(gmFmRows, ['GM Name', 'GM NAME', 'GM']), 'All GMs');
  populateDropdown('select-bda-fc', uniqueValues(bdaFcRows, ['BDA Name', 'BDA']), 'All BDAs');
  populateDropdown('select-bda-fm', uniqueValues(bdaFmRows, ['BDA Name', 'BDA']), 'All BDAs');

  state.sectionCohortFilters.fc = document.getElementById('select-sec-fc-cohort')?.value || 'ALL';
  state.sectionMonthFilters.fm = document.getElementById('select-sec-fm-month')?.value || 'ALL';
  state.leaderCohortFilters['tl-fc'] = document.getElementById('select-tl-fc-cohort')?.value || 'ALL';
  state.leaderCohortFilters['gm-fc'] = document.getElementById('select-gm-fc-cohort')?.value || 'ALL';
  state.leaderCohortFilters['bda-fc'] = document.getElementById('select-bda-fc-cohort')?.value || 'ALL';
  state.leaderMonthFilters['tl-fm'] = document.getElementById('select-tl-fm-month')?.value || 'ALL';
  state.leaderMonthFilters['gm-fm'] = document.getElementById('select-gm-fm-month')?.value || 'ALL';
  state.leaderMonthFilters['bda-fm'] = document.getElementById('select-bda-fm-month')?.value || 'ALL';
  state.leaderFilters['tl-fc'] = document.getElementById('select-tl-fc')?.value || 'ALL';
  state.leaderFilters['tl-fm'] = document.getElementById('select-tl-fm')?.value || 'ALL';
  state.leaderFilters['gm-fc'] = document.getElementById('select-gm-fc')?.value || 'ALL';
  state.leaderFilters['gm-fm'] = document.getElementById('select-gm-fm')?.value || 'ALL';
  state.leaderFilters['bda-fc'] = document.getElementById('select-bda-fc')?.value || 'ALL';
  state.leaderFilters['bda-fm'] = document.getElementById('select-bda-fm')?.value || 'ALL';
}

function renderLeadershipList(chartKey) {
  renderProgressTable(chartKey);
}

/* ── LEADERSHIP BANNER RENDER ────────────────────── */
function getInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectUniqueLeaderNames(rows, roleKeys) {
  const names = [];
  rows.forEach((row) => {
    const value = safeString(firstDefined(row, roleKeys));
    if (value && !names.includes(value)) names.push(value);
  });
  return names.sort((a, b) => a.localeCompare(b));
}

function buildLeaderBannerChips(names, chipClass, emptyLabel) {
  if (!names.length) {
    return `<span class="leader-name-chip placeholder ${chipClass}"><span>${emptyLabel}</span></span>`;
  }
  return names.map((name) => {
    const initials = getInitials(name);
    return `<span class="leader-name-chip ${chipClass}" data-initials="${escapeHtml(initials)}"><span>${escapeHtml(name)}</span></span>`;
  }).join('');
}

function setLeadershipBannerView(mode) {
  const gmContainer = document.getElementById('banner-gm-names');
  const tlContainer = document.getElementById('banner-tl-names');
  if (!gmContainer || !tlContainer) return;

  if (mode === 'loading') {
    gmContainer.innerHTML = '<span class="leader-name-chip placeholder gm-chip is-loading"><span>Loading…</span></span>';
    tlContainer.innerHTML = '<span class="leader-name-chip placeholder tl-chip is-loading"><span>Loading…</span></span>';
    return;
  }

  if (mode === 'error') {
    gmContainer.innerHTML = '<span class="leader-name-chip placeholder gm-chip"><span>Unable to load</span></span>';
    tlContainer.innerHTML = '<span class="leader-name-chip placeholder tl-chip"><span>Unable to load</span></span>';
  }
}

function renderLeadershipBanner() {
  const gmContainer = document.getElementById('banner-gm-names');
  const tlContainer = document.getElementById('banner-tl-names');
  if (!gmContainer || !tlContainer) return;

  if (state.isLoading) {
    setLeadershipBannerView('loading');
    return;
  }

  if (state.hasError) {
    setLeadershipBannerView('error');
    return;
  }

  const gmRows = filterData(datasets.gmCohort, { 'Program Name': state.activeProgram });
  const tlRows = filterData(datasets.tlCohort, { 'Program Name': state.activeProgram });
  const gmNames = collectUniqueLeaderNames(gmRows, ['GM Name', 'GM NAME', 'GM']);
  const tlNames = collectUniqueLeaderNames(tlRows, ['TL Name', 'TL NAME']);

  gmContainer.innerHTML = buildLeaderBannerChips(gmNames, 'gm-chip', 'Not assigned');
  tlContainer.innerHTML = buildLeaderBannerChips(tlNames, 'tl-chip', 'Not assigned');
}

function setLoadingView() {
  setLeadershipBannerView('loading');
  ['card-fc-tgt', 'card-fc-ach', 'card-fc-pct', 'card-fc-revtgt', 'card-fc-revach', 'card-fc-revpct',
    'card-fm-tgt', 'card-fm-ach', 'card-fm-pct', 'card-fm-revtgt', 'card-fm-revach', 'card-fm-revpct']
    .forEach((id) => setText(id, 'Loading...'));
  ['list-tl-fc', 'list-tl-fm', 'list-gm-fc', 'list-gm-fm', 'list-bda-fc', 'list-bda-fm'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px;">Loading...</div>';
  });
}

function setErrorView() {
  setLeadershipBannerView('error');
  ['card-fc-tgt', 'card-fc-ach', 'card-fc-pct', 'card-fc-revtgt', 'card-fc-revach', 'card-fc-revpct',
    'card-fm-tgt', 'card-fm-ach', 'card-fm-pct', 'card-fm-revtgt', 'card-fm-revach', 'card-fm-revpct']
    .forEach((id) => setText(id, 'NA'));
  ['list-tl-fc', 'list-tl-fm', 'list-gm-fc', 'list-gm-fm', 'list-bda-fc', 'list-bda-fm'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px;">Unable to load data</div>';
  });
}

function updateDashboard() {
  if (state.hasError) {
    setErrorView();
    return;
  }
  updateDependentDropdowns();
  renderCards('fc');
  renderCards('fm');
  renderLeadershipList('tl-fc');
  renderLeadershipList('tl-fm');
  renderLeadershipList('gm-fc');
  renderLeadershipList('gm-fm');
  renderLeadershipList('bda-fc');
  renderLeadershipList('bda-fm');
  renderLeadershipBanner();
  syncOverviewDropdowns();
  renderOverviewPanel();
}

async function initializeDashboard() {
  state.isLoading = true;
  state.hasError = false;
  setLoadingView();
  try {
    const settled = await Promise.allSettled([
      fetchCSV(DATA_SOURCES.fullPaymentCohort),
      fetchCSV(DATA_SOURCES.fullPaymentMonthly),
      fetchCSV(DATA_SOURCES.tlCohort),
      fetchCSV(DATA_SOURCES.tlMonthly),
      fetchCSV(DATA_SOURCES.gmCohort),
      fetchCSV(DATA_SOURCES.gmMonthly),
      fetchCSV(DATA_SOURCES.bdaCohort),
      fetchCSV(DATA_SOURCES.bdaMonthly)
    ]);
    const keys = [
      'fullPaymentCohort', 'fullPaymentMonthly', 'tlCohort', 'tlMonthly',
      'gmCohort', 'gmMonthly', 'bdaCohort', 'bdaMonthly'
    ];
    let successCount = 0;
    settled.forEach((result, idx) => {
      const key = keys[idx];
      if (result.status === 'fulfilled') {
        datasets[key] = result.value;
        successCount += 1;
      } else {
        datasets[key] = [];
        console.warn(`Failed loading ${key}:`, result.reason);
      }
    });
    state.hasError = successCount === 0;
    populateDropdown('program-filter', getAllPrograms(), 'All Programs');
    state.activeProgram = document.getElementById('program-filter')?.value || 'ALL';
  } catch (err) {
    console.error(err);
    state.hasError = true;
  } finally {
    state.isLoading = false;
    updateDashboard();
    setLastUpdated();
  }
}

function setLastUpdated() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  setText('last-updated-text', `Last updated: ${dateStr} ${timeStr}`);
}

function onProgramChange(val) {
  state.activeProgram = val;
  updateDashboard();
}

function onSectionCohortChange(prefix, value) {
  state.sectionCohortFilters[prefix] = value;
  renderCards('fc');
}

function onSectionMonthChange(prefix, value) {
  state.sectionMonthFilters[prefix] = value;
  renderCards('fm');
}

function onLeaderFilterChange(chartKey, value) {
  state.leaderFilters[chartKey] = value;
  renderLeadershipList(chartKey);
}

function onLeaderCohortFilterChange(chartKey, value) {
  state.leaderCohortFilters[chartKey] = value;
  updateDashboard();
}

function onLeaderMonthFilterChange(chartKey, value) {
  state.leaderMonthFilters[chartKey] = value;
  updateDashboard();
}

function onLeaderSortChange(chartKey, value) {
  state.leaderSorts[chartKey] = value;
  renderLeadershipList(chartKey);
}

function toggleTheme() {
  const html = document.documentElement;
  html.classList.toggle('dark');
  const isDarkMode = html.classList.contains('dark');
  localStorage.setItem('certification-theme', isDarkMode ? 'dark' : 'light');
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun) sun.style.display = isDarkMode ? 'block' : 'none';
  if (moon) moon.style.display = isDarkMode ? 'none' : 'block';
}

function initTheme() {
  const saved = localStorage.getItem('certification-theme');
  if (saved === 'dark') {
    document.documentElement.classList.add('dark');
    const sun = document.getElementById('theme-icon-sun');
    const moon = document.getElementById('theme-icon-moon');
    if (sun) sun.style.display = 'block';
    if (moon) moon.style.display = 'none';
  }
}

async function handleRefresh() {
  const btn = document.getElementById('refresh-btn');
  if (btn) btn.classList.add('spinning');
  csvCache.clear();
  try {
    await initializeDashboard();
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

/* ── OVERVIEW PANEL ──────────────────────────────── */

const OV_COLORS = 8; // must match ov-color-N / ov-dot-N count in CSS

function syncOverviewDropdowns() {
  const mode = document.getElementById('ov-fp-type')?.value || 'cohort';
  const isCohort = mode === 'cohort';

  const cohortGroup = document.getElementById('ov-cohort-group');
  const monthGroup  = document.getElementById('ov-month-group');
  if (cohortGroup) cohortGroup.style.display = isCohort ? '' : 'none';
  if (monthGroup)  monthGroup.style.display  = isCohort ? 'none' : '';

  if (isCohort) {
    const rows = datasets.fullPaymentCohort;
    populateDropdown('ov-cohort', uniqueValues(rows, 'Cohort Name'), 'All Cohorts');
  } else {
    const rows = datasets.fullPaymentMonthly;
    populateDropdown('ov-month', uniqueValues(rows, 'Month'), 'All Months');
  }
}

function renderOverviewPanel() {
  const body = document.getElementById('overview-body');
  if (!body) return;

  const mode     = document.getElementById('ov-fp-type')?.value || 'cohort';
  const isCohort = mode === 'cohort';

  // Source dataset + filter selection
  let sourceRows;
  if (isCohort) {
    const cohort = document.getElementById('ov-cohort')?.value || 'ALL';
    sourceRows = filterData(datasets.fullPaymentCohort, { 'Cohort Name': cohort });
  } else {
    const month = document.getElementById('ov-month')?.value || 'ALL';
    sourceRows = filterData(datasets.fullPaymentMonthly, { Month: month });
  }

  // Column names depend on mode
  const targetCol   = isCohort ? 'Cohort Enrollment Target'    : 'Month Enrollment Target';
  const achievedCol = isCohort ? 'Cohort Enrollment Acheived'  : 'Month Enrollment Acheived';
  const pctCol      = isCohort ? 'Cohort Enrollment Acheivement %' : 'Month Enrollment Acheivement %';

  // Collect all unique programs present in the dataset
  const programs = uniqueValues(sourceRows, 'Program Name').sort((a, b) => a.localeCompare(b));

  if (!programs.length) {
    body.innerHTML = '<div class="overview-empty">No data available for the selected filters.</div>';
    return;
  }

  const rows = programs.map((prog, idx) => {
    const progRows = filterData(sourceRows, { 'Program Name': prog });
    const target   = progRows.reduce((s, r) => s + toNumber(firstDefined(r, targetCol)),   0);
    const achieved = progRows.reduce((s, r) => s + toNumber(firstDefined(r, achievedCol)), 0);
    // Try reading pct directly; fall back to computed
    const pctRaw   = toPercent(firstDefined(progRows[0] || {}, pctCol));
    const pct      = pctRaw > 0 ? pctRaw : (target > 0 ? (achieved / target) * 100 : 0);
    const pctClamped = clamp(pct, 0, 100);
    const colorIdx = idx % OV_COLORS;

    // Collect TL names for this program
    const tlProgRows = filterData(datasets.tlCohort, { 'Program Name': prog });
    const tlNames = collectUniqueLeaderNames(tlProgRows, ['TL Name', 'TL NAME']);
    const tlChipsHtml = tlNames.length
      ? tlNames.map((name) => {
          const initials = getInitials(name);
          return `<span class="ov-tl-chip" data-initials="${escapeHtml(initials)}" title="${escapeHtml(name)}"><span>${escapeHtml(name)}</span></span>`;
        }).join('')
      : '';

    return `
      <div class="overview-program-row">
        <div class="overview-prog-name">
          <span class="overview-prog-name-badge">
            <span class="overview-prog-dot ov-dot-${colorIdx}"></span>
            <span class="overview-prog-name-wrap">
              ${escapeHtml(prog)}
              ${tlChipsHtml ? `<span class="ov-tl-chips-row">${tlChipsHtml}</span>` : ''}
            </span>
          </span>
        </div>
        <div class="overview-bar-wrap">
          <div class="overview-bar-track">
            <div class="overview-bar-fill ov-color-${colorIdx}" style="width:${pctClamped.toFixed(1)}%"></div>
          </div>
          <span class="overview-bar-pct">${pct.toFixed(1)}% achieved</span>
        </div>
        <div class="overview-target-wrap">
          <span class="overview-target-label">Target</span>
          <span class="overview-target-val">${fmt(target)}</span>
          <span class="overview-achieved-val">${fmt(achieved)} done</span>
        </div>
      </div>
    `;
  });

  body.innerHTML = rows.join('');
}

function onOverviewChange() {
  syncOverviewDropdowns();
  renderOverviewPanel();
}

function init() {
  initTheme();
  initializeDashboard();
}

document.addEventListener('DOMContentLoaded', init);
