const { alnum } = require('../utils/normalize');

const EPS = 0.005;
const MAX_AMOUNT_ONLY_CANDIDATES = 5;
const eq = (a, b) => Math.abs(a - b) < EPS;

/**
 * Deterministic matching rules (no AI, no scoring, no guessing).
 *
 *  ctx.flats     : [{ id, flatNumber, upiIds[] }]
 *  ctx.openBills : [{ id, flat, balance, period }]   (balance > 0)
 *
 * Outcomes:
 *  matched       exact amount + registered UPI ID + reference naming the flat, and nothing else competes
 *  manual_review exact amount + UPI but uncertain reference | amount matches but UPI differs |
 *                multiple flats match | flat identified but amount differs from what is outstanding
 *  unmatched     no flat can be identified
 *  (duplicates are detected by the caller before matching)
 *
 * Ambiguous transactions are NEVER auto-allocated.
 */
function matchTransaction(tx, ctx) {
  const flatsById = new Map(ctx.flats.map((f) => [String(f.id), f]));
  const billsByFlat = new Map();
  for (const b of ctx.openBills) {
    const k = String(b.flat);
    if (!billsByFlat.has(k)) billsByFlat.set(k, []);
    billsByFlat.get(k).push(b);
  }

  const amountFlats = new Set([...billsByFlat].filter(([, bills]) => bills.some((b) => eq(b.balance, tx.amount))).map(([k]) => k));
  const upiFlats = new Set(tx.upiId ? ctx.flats.filter((f) => f.upiIds.includes(tx.upiId)).map((f) => String(f.id)) : []);
  const text = [alnum(tx.reference), alnum(tx.description)];
  const refFlats = new Set(ctx.flats.filter((f) => {
    const code = alnum(f.flatNumber);
    return code && text.some((t) => t.includes(code));
  }).map((f) => String(f.id)));

  const inter = (...lists) => { const sets = lists.map((l) => new Set(l)); return [...sets[0]].filter((x) => sets.every((s) => s.has(x))); };
  const union = (...sets) => [...new Set(sets.flatMap((s) => [...s]))];
  const result = (status, reason, candidates = [], flatId = null, bill = null) => ({
    status, reason, candidateFlats: candidates.slice(0, 10), matchedFlat: flatId, bill,
  });

  const full = inter(amountFlats, upiFlats, refFlats);
  const strong = inter(amountFlats, union(upiFlats, refFlats));

  if (full.length === 1 && strong.length === 1) {
    const flatId = full[0];
    const bills = billsByFlat.get(flatId).filter((b) => eq(b.balance, tx.amount));
    if (bills.length === 1) {
      return result('matched', 'Exact amount, registered UPI ID and flat reference all agree', [flatId], flatId, bills[0]);
    }
    return result('manual_review', 'More than one bill of this flat has this balance', [flatId]);
  }
  if (full.length > 1 || (full.length === 1 && strong.length > 1)) {
    return result('manual_review', 'Multiple flats match this transaction', strong);
  }

  const amtUpi = inter(amountFlats, upiFlats);
  if (amtUpi.length === 1) return result('manual_review', 'Exact amount and UPI ID match, but the reference is missing or uncertain', amtUpi);
  if (amtUpi.length > 1) return result('manual_review', 'Multiple flats match this transaction', amtUpi);

  const amtRef = inter(amountFlats, refFlats);
  if (amtRef.length === 1) return result('manual_review', 'Amount and reference match, but the UPI ID differs from the one on record', amtRef);
  if (amtRef.length > 1) return result('manual_review', 'Multiple flats match this transaction', amtRef);

  if (amountFlats.size > 0 && amountFlats.size <= MAX_AMOUNT_ONLY_CANDIDATES) {
    return result('manual_review', 'Amount matches an outstanding bill, but no UPI ID or reference identifies the flat', [...amountFlats]);
  }

  const identified = union(upiFlats, refFlats).filter((id) => flatsById.has(id));
  if (identified.length > 0) {
    return result('manual_review', 'Flat is identified by UPI/reference, but the amount differs from its outstanding bill', identified);
  }

  return result('unmatched', amountFlats.size > 0
    ? 'Amount matches too many outstanding bills to suggest a flat, and nothing else identifies one'
    : 'No flat could be identified');
}

module.exports = { matchTransaction };
