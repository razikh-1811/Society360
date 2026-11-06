const crypto = require('crypto');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Rs. 6,370.00", "₹6370", "6,370 CR" -> 6370. Returns NaN when no number is present.
function normalizeAmount(value) {
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  // Take the first number in the text, so currency symbols and "Rs." / "CR" suffixes cannot corrupt it.
  const m = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?|-?\.\d+/);
  if (!m) return NaN;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

// UPI IDs are case-insensitive "handle@bank". Anything without an "@" is not a UPI ID.
function normalizeUpi(value) {
  const s = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  return /^[a-z0-9._\-]{2,}@[a-z0-9]{2,}$/.test(s) ? s : '';
}

// Upper-case, whitespace removed.
const normalizeRef = (value) => String(value ?? '').toUpperCase().replace(/\s+/g, '');
// Letters and digits only: lets "T07-1203", "t07 1203" and "T071203" compare equal.
const alnum = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function utcDate(y, m, d) {
  y = +y; m = +m; d = +d;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

// Accepts yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy and dd-Mon-yyyy (day-first, as used in India).
function parseDate(value) {
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utcDate(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return utcDate(m[3], m[2], m[1]);
  m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return utcDate(m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, m[1]);
  return null;
}

// Deterministic identity of a bank transaction. Same inputs => same fingerprint, so re-uploads are caught.
function fingerprint({ txnId, date, amount, upiId, reference }) {
  const key = [alnum(txnId), date.toISOString().slice(0, 10), amount.toFixed(2), upiId, alnum(reference)].join('|');
  return crypto.createHash('sha256').update(key).digest('hex');
}

module.exports = { normalizeAmount, normalizeUpi, normalizeRef, alnum, parseDate, fingerprint };
