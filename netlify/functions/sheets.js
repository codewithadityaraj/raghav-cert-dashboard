const SHEET_URLS = {
  fullPaymentCohort: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBGYVm4WeDri55fxkXbFKVPRw4f7oIDtM3SySzIhh8MdkVU1-h2G-FoZwDvzdhJPcWlQPiUGSNNKmn/pub?gid=330939970&single=true&output=csv',
  fullPaymentMonthly: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBGYVm4WeDri55fxkXbFKVPRw4f7oIDtM3SySzIhh8MdkVU1-h2G-FoZwDvzdhJPcWlQPiUGSNNKmn/pub?gid=1529421032&single=true&output=csv',
  tlCohort: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBGYVm4WeDri55fxkXbFKVPRw4f7oIDtM3SySzIhh8MdkVU1-h2G-FoZwDvzdhJPcWlQPiUGSNNKmn/pub?gid=1379419762&single=true&output=csv',
  tlMonthly: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBGYVm4WeDri55fxkXbFKVPRw4f7oIDtM3SySzIhh8MdkVU1-h2G-FoZwDvzdhJPcWlQPiUGSNNKmn/pub?gid=1253162755&single=true&output=csv',
  gmCohort: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBGYVm4WeDri55fxkXbFKVPRw4f7oIDtM3SySzIhh8MdkVU1-h2G-FoZwDvzdhJPcWlQPiUGSNNKmn/pub?gid=2126600034&single=true&output=csv',
  gmMonthly: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBGYVm4WeDri55fxkXbFKVPRw4f7oIDtM3SySzIhh8MdkVU1-h2G-FoZwDvzdhJPcWlQPiUGSNNKmn/pub?gid=1449154150&single=true&output=csv'
};

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
    if (!sheetKey || !SHEET_URLS[sheetKey]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid or missing sheet key' })
      };
    }

    const response = await fetch(SHEET_URLS[sheetKey], {
      headers: { 'User-Agent': 'NetlifyFunction/1.0' }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `Upstream error ${response.status}` })
      };
    }

    const csv = await response.text();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sheet: sheetKey, csv })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Unexpected server error' })
    };
  }
};
