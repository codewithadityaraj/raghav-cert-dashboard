const XLSX = require('xlsx');

const WORKBOOK_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRdGlnE53K-er93AZC_2Na83aYvoGUNB0kHoAXRKHRXvNWYwufokS8GGdpf2qrCa0zUrr25uSBXUMVe/pub?output=xlsx';

/** sheet query param -> workbook tab names (first match wins) */
const SHEET_TABS = {
  fullPaymentCohort: ['Cert Program Full Payment Cohort', 'Cert Program Full Payment Cohor'],
  fullPaymentMonthly: ['Cert Program Full Payment Month'],
  tlCohort: ['Cert TL Wise Cohort Full'],
  tlMonthly: ['Cert TL Wise Monthly Full'],
  gmCohort: ['Cert GM Wise Cohort Full'],
  gmMonthly: ['Cert GM Wise Monthly Full'],
  bdaCohort: ['Cert BDA Wise Cohort Full'],
  bdaMonthly: ['Cert BDA Wise Monthly Full']
};

let workbookCache = null;
let workbookCacheAt = 0;
const sheetCsvCache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function resolveSheetName(workbook, candidates) {
  const names = workbook.SheetNames || [];
  const normalized = new Map(names.map((n) => [normalizeName(n), n]));
  for (const candidate of candidates) {
    const exact = normalized.get(normalizeName(candidate));
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const needle = normalizeName(candidate);
    const fuzzy = names.find((n) => normalizeName(n).startsWith(needle) || needle.startsWith(normalizeName(n)));
    if (fuzzy) return fuzzy;
  }
  return null;
}

async function loadWorkbook(forceRefresh = false) {
  const now = Date.now();
  if (forceRefresh) {
    workbookCache = null;
    workbookCacheAt = 0;
    sheetCsvCache.clear();
  }
  if (workbookCache && now - workbookCacheAt < CACHE_MS) return workbookCache;

  const response = await fetch(WORKBOOK_URL, {
    headers: { 'User-Agent': 'NetlifyFunction/1.0' }
  });
  if (!response.ok) {
    throw new Error(`Workbook fetch failed: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  workbookCache = XLSX.read(buffer, { type: 'array' });
  workbookCacheAt = now;
  sheetCsvCache.clear();
  return workbookCache;
}

function sheetToCsv(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Tab not found: ${sheetName}`);
  return XLSX.utils.sheet_to_csv(sheet);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const sheetKey = event.queryStringParameters?.sheet;
    const candidates = SHEET_TABS[sheetKey];
    if (!sheetKey || !candidates) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid or missing sheet key' })
      };
    }

    const forceRefresh = event.queryStringParameters?.refresh === '1';

    if (!forceRefresh && sheetCsvCache.has(sheetKey)) {
      const cached = sheetCsvCache.get(sheetKey);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ sheet: sheetKey, tab: cached.tab, csv: cached.csv, refreshed: false })
      };
    }

    if (forceRefresh) {
      workbookCache = null;
      workbookCacheAt = 0;
      sheetCsvCache.clear();
    }

    const workbook = await loadWorkbook(forceRefresh);
    const tabName = resolveSheetName(workbook, candidates);
    if (!tabName) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `Workbook tab not found for ${sheetKey}` })
      };
    }

    const csv = sheetToCsv(workbook, tabName);
    sheetCsvCache.set(sheetKey, { tab: tabName, csv });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sheet: sheetKey, tab: tabName, csv, refreshed: forceRefresh })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Unexpected server error' })
    };
  }
};
