// ── formatting ────────────────────────────────────────────────────────
import { PRESENT_YEAR } from './data/events.js';

const withCommas = (n) => Math.round(n).toLocaleString('en-US');

export function formatYearsAgo(ya) {
  if (ya < 1.5) return 'one year ago';
  if (ya < 1e3) return `${Math.round(ya)} years ago`;
  if (ya < 1e6) return `${withCommas(ya)} years ago`;
  if (ya < 1e9) {
    const m = ya / 1e6;
    return `${m < 10 ? m.toFixed(1) : Math.round(m)} million years ago`;
  }
  const b = ya / 1e9;
  return `${b < 10 ? b.toFixed(1) : b.toFixed(1)} billion years ago`;
}

// calendar year for recent events, deep time otherwise
export function formatWhen(ya) {
  if (ya <= PRESENT_YEAR + 1000) {
    const ce = PRESENT_YEAR - Math.round(ya);
    if (ce > 1500) return `${ce}`;
    if (ce > 0) return `${ce} CE`;
    return `${1 - ce} BCE`;
  }
  return formatYearsAgo(ya);
}

export function formatDistance(km) {
  const m = km * 1000;
  if (m < 0.01) return `${(m * 1000).toFixed(1)} mm`;
  if (m < 1) return `${(m * 100).toFixed(1)} cm`;
  if (m < 100) return `${m.toFixed(1)} m`;
  if (m < 1000) return `${Math.round(m)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${withCommas(km)} km`;
}
