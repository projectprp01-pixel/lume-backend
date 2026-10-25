import axios from 'axios';
import {
  OPERA_BASE_URL, OPERA_HOTEL_ID, OPERA_ENTERPRISE_ID, OPERA_SCOPE,
  OPERA_CLIENT_ID, OPERA_CLIENT_SECRET, OPERA_APP_KEY,
} from '../../config/env.js';

// Read-only client for Opera Cloud (OHIP). Only the OAuth token call is a POST; everything else is a GET.
// See https://lumepms.docs.buildwithfern.com for the API reference and the sync design notes.

export const PAGE_SIZE = 200; // Opera silently caps `limit` at 200, so a page shorter than this is the last one.
const MAX_ATTEMPTS = 3;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

let cachedToken = null; // { value, expiresAt }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isOperaConfigured = () =>
  Boolean(OPERA_BASE_URL && OPERA_HOTEL_ID && OPERA_ENTERPRISE_ID && OPERA_SCOPE && OPERA_CLIENT_ID && OPERA_CLIENT_SECRET && OPERA_APP_KEY);

// Retry transient failures (network, timeout, 5xx, 429) with exponential backoff; fail fast on other 4xx.
async function withRetry(label, fn) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const transient = !status || status >= 500 || status === 429;
      if (!transient || attempt === MAX_ATTEMPTS) break;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  const status = lastErr.response?.status;
  throw new Error(`Opera ${label} failed${status ? ` (HTTP ${status})` : ''}: ${lastErr.response?.data?.detail || lastErr.message}`);
}

async function getToken() {
  if (cachedToken && cachedToken.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return cachedToken.value;

  const { data } = await withRetry('token request', () =>
    axios.post(
      `${OPERA_BASE_URL}/oauth/v1/tokens`,
      new URLSearchParams({ grant_type: 'client_credentials', scope: OPERA_SCOPE }).toString(),
      {
        timeout: 15000,
        headers: {
          Authorization: `Basic ${Buffer.from(`${OPERA_CLIENT_ID}:${OPERA_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          enterpriseId: OPERA_ENTERPRISE_ID,
          'x-app-key': OPERA_APP_KEY,
        },
      }
    )
  );
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function operaGet(path, params) {
  return withRetry(`GET ${path}`, async () => {
    const token = await getToken();
    try {
      const { data } = await axios.get(`${OPERA_BASE_URL}${path}`, {
        params,
        timeout: 30000,
        headers: { Authorization: `Bearer ${token}`, 'x-hotelid': OPERA_HOTEL_ID, 'x-app-key': OPERA_APP_KEY },
      });
      return data;
    } catch (err) {
      if (err.response?.status === 401) cachedToken = null; // token revoked early: refetch on the retry
      throw err;
    }
  });
}

/**
 * Every reservation matching `query` (Opera search params), paged 200 at a time. Stops on the first page
 * shorter than 200 — never by comparing against the requested limit, which Opera ignores above 200.
 */
export async function searchReservations(query) {
  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const data = await operaGet(`/rsv/v1/hotels/${OPERA_HOTEL_ID}/reservations`, { ...query, limit: PAGE_SIZE, offset });
    const page = data?.reservations?.reservationInfo ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}
