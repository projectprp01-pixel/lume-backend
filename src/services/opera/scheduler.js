import cron from 'node-cron';
import { OPERA_SYNC_ENABLED, OPERA_SYNC_FAST_MINUTES, OPERA_TIMEZONE, OPERA_HOTEL_ID } from '../../config/env.js';
import { isOperaConfigured } from './operaClient.js';
import { runSync } from './pmsSync.js';

/** Starts the Opera pollers when OPERA_SYNC_ENABLED=true. Safe to call unconditionally. */
export function startPmsSync() {
  if (!OPERA_SYNC_ENABLED) return;
  if (!isOperaConfigured()) {
    console.warn('[PMS sync] OPERA_SYNC_ENABLED is true but OPERA_* variables are incomplete — not starting.');
    return;
  }

  const minutes = Math.min(Math.max(OPERA_SYNC_FAST_MINUTES, 1), 59);
  cron.schedule(`*/${minutes} * * * *`, () => runSync('fast'));
  cron.schedule('0 2 * * *', () => runSync('nightly'), { timezone: OPERA_TIMEZONE });
  console.log(`[PMS sync] started for ${OPERA_HOTEL_ID}: fast tier every ${minutes} min, nightly tier 02:00 ${OPERA_TIMEZONE}`);

  // Don't wait up to a full interval for the first data.
  setTimeout(() => runSync('fast'), 10000);
}
