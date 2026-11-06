const request = require('supertest');
const db = require('./helpers/db');
const app = require('../app');
const { makeFlat, makeUser, makeBill, bearer } = require('./helpers/factory');
const { normalizeAmount, normalizeUpi, parseDate } = require('../utils/normalize');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const BankTransaction = require('../models/BankTransaction');

const row = (id, amount, upi, ref, extra = {}) => ({
  'Txn ID': id, Date: '05/11/2026', Description: extra.description ?? 'UPI CREDIT', Amount: String(amount),
  Type: extra.type ?? 'CR', 'UPI ID': upi, Reference: ref,
});

let desk, committee, resident;
const F = {};
const upload = (rows, as = desk, filename = 'stmt.csv') =>
  request(app).post('/api/reconciliation/upload').set(bearer(as)).send({ filename, rows });
const find = (res, txnId) => res.body.transactions.find((t) => t.txnId === txnId);

beforeAll(async () => {
  await db.connect('society360_test_recon');
  desk = await makeUser('helpdesk', { name: 'Desk Tester' });
  committee = await makeUser('committee');
  // Distinct areas => distinct balances, so scenarios never collide.
  const spec = { f1: [1010, ['one@okhdfc']], f2: [1020, ['two@okhdfc']], f3: [1030, ['three@okhdfc']], f4: [1040, ['four@okhdfc']],
    f5a: [1050, ['family@okaxis']], f5b: [1050, ['family@okaxis']], f8: [1060, ['eight@oksbi']] };
  for (const [k, [area, upiIds]] of Object.entries(spec)) {
    F[k] = await makeFlat({ areaSqft: area, upiIds });
    F[k].bill = await makeBill(F[k], { daysOverdue: 20 });
  }
  resident = await makeUser('resident', { flat: F.f1._id });
});
afterAll(db.disconnect);

describe('Normalization', () => {
  test('amounts, UPI IDs and dates are normalized', () => {
    expect(normalizeAmount('₹6,565.00')).toBe(6565);
    expect(normalizeAmount('Rs. 1,23,456.50 CR')).toBe(123456.5);
    expect(normalizeAmount('abc')).toBeNaN();
    expect(normalizeUpi('  ONE@OKHDFC ')).toBe('one@okhdfc');
    expect(normalizeUpi('not a upi')).toBe('');
    expect(parseDate('05/11/2026').toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(parseDate('2026-11-05').toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(parseDate('5-Nov-2026').toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(parseDate('31/02/2026')).toBeNull();
  });
});

describe('Matching rules', () => {
  let first;
  test('exact amount + UPI + reference => auto-matched and posted (messy input is normalized)', async () => {
    first = await upload([
      row('B-EXACT', '₹6,565.00', ' ONE@OKHDFC ', `maint ${F.f1.flatNumber.toLowerCase()}`),
      row('B-AMT-MISMATCH', 6000, 'two@okhdfc', F.f2.flatNumber),
      row('B-UPI-DIFF', 6695, 'other@oksbi', F.f3.flatNumber),
      row('B-REF-BLANK', 6760, 'four@okhdfc', ''),
      row('B-AMBIG-1', 6825, 'family@okaxis', ''),
      row('B-AMBIG-2', 6825, 'family@okaxis', F.f5a.flatNumber),
      row('B-NOFLAT', 99999.99, 'nobody@okicici', 'RANDOM'),
      row('B-DEBIT', 500, '', '', { type: 'DR' }),
      { 'Txn ID': '', Date: 'garbage', Amount: 'x' },
    ]);
    expect(first.status).toBe(201);
    expect(find(first, 'B-EXACT')).toMatchObject({ status: 'matched', amount: 6565, upiId: 'one@okhdfc' });
    const bill = await Bill.findById(F.f1.bill._id);
    expect(bill).toMatchObject({ paidAmount: 6565, status: 'paid' });
    expect(await Payment.countDocuments({ flat: F.f1._id, method: 'bank_reconciliation' })).toBe(1);
  });
  test('amount mismatch => manual review, nothing posted', async () => {
    expect(find(first, 'B-AMT-MISMATCH').status).toBe('manual_review');
    expect((await Bill.findById(F.f2.bill._id)).paidAmount).toBe(0);
  });
  test('UPI mismatch => manual review', async () => {
    const t = find(first, 'B-UPI-DIFF');
    expect(t.status).toBe('manual_review');
    expect(t.matchReason).toMatch(/UPI/);
    expect((await Bill.findById(F.f3.bill._id)).paidAmount).toBe(0);
  });
  test('exact amount + UPI but uncertain reference => manual review', async () => {
    expect(find(first, 'B-REF-BLANK').status).toBe('manual_review');
    expect((await Bill.findById(F.f4.bill._id)).paidAmount).toBe(0);
  });
  test('ambiguous (multiple matching flats) is never auto-allocated', async () => {
    for (const id of ['B-AMBIG-1', 'B-AMBIG-2']) {
      const t = find(first, id);
      expect(t.status).toBe('manual_review');
      expect(t.matchedFlat).toBeNull();
      expect(t.candidateFlats.length).toBe(2);
    }
    expect((await Bill.findById(F.f5a.bill._id)).paidAmount).toBe(0);
    expect((await Bill.findById(F.f5b.bill._id)).paidAmount).toBe(0);
  });
  test('no matching flat => unmatched', () => {
    expect(find(first, 'B-NOFLAT').status).toBe('unmatched');
  });
  test('debit rows are skipped and unusable rows are reported', () => {
    expect(first.body.batch.counts).toMatchObject({ rows: 9, matched: 1, manualReview: 5, unmatched: 1, skippedDebits: 1, invalid: 1, duplicates: 0 });
    expect(first.body.batch.invalidRows[0].reason).toMatch(/transaction ID/);
  });
});

describe('Duplicate detection and double allocation', () => {
  test('re-uploading the same statement creates no new transactions or payments', async () => {
    const before = await BankTransaction.countDocuments();
    const res = await upload([row('B-EXACT', '₹6,565.00', 'one@okhdfc', F.f1.flatNumber), row('B-NOFLAT', 99999.99, 'nobody@okicici', 'RANDOM')]);
    expect(res.body.batch.counts.duplicates).toBe(2);
    expect(res.body.transactions).toHaveLength(0);
    expect(await BankTransaction.countDocuments()).toBe(before);
    expect(await Payment.countDocuments({ flat: F.f1._id })).toBe(1);
  });
  test('a transaction ID repeated inside one file is processed once', async () => {
    const r = await upload([row('B-WITHIN', 12345.67, 'x1@okicici', 'A'), row('B-WITHIN', 12345.67, 'x1@okicici', 'A')]);
    expect(r.body.batch.counts).toMatchObject({ unmatched: 1, duplicates: 1 });
  });
  test('two exact payments for one bill: only the first posts (no double allocation)', async () => {
    const r = await upload([
      row('B-DBL-1', 6890, 'eight@oksbi', F.f8.flatNumber),
      row('B-DBL-2', 6890, 'eight@oksbi', F.f8.flatNumber),
    ]);
    expect(find(r, 'B-DBL-1').status).toBe('matched');
    expect(find(r, 'B-DBL-2').status).toBe('manual_review');
    expect(await Payment.countDocuments({ flat: F.f8._id })).toBe(1);
    expect((await Bill.findById(F.f8.bill._id)).paidAmount).toBe(6890);
  });
  test('the same ID with changed details is still caught as a duplicate', async () => {
    const r = await upload([row('B-DBL-1', 1, 'a@b.cc', 'zzz')]);
    expect(r.body.batch.counts.duplicates).toBe(1);
  });
});

describe('Manual verification', () => {
  const resolve = (id, body, as = desk) => request(app).post(`/api/reconciliation/transactions/${id}/resolve`).set(bearer(as)).send(body);

  test('approving a review item posts the payment once; a second approval is refused', async () => {
    const t = await BankTransaction.findOne({ txnId: 'B-REF-BLANK' });
    const ok = await resolve(t._id, { action: 'approve', flatId: String(F.f4._id) });
    expect(ok.status).toBe(200);
    expect(ok.body.transaction).toMatchObject({ status: 'matched' });
    expect((await Bill.findById(F.f4.bill._id)).status).toBe('paid');
    expect((await resolve(t._id, { action: 'approve', flatId: String(F.f4._id) })).status).toBe(409);
    expect(await Payment.countDocuments({ flat: F.f4._id })).toBe(1);
  });
  test('an ambiguous item can be manually assigned to the right flat', async () => {
    const t = await BankTransaction.findOne({ txnId: 'B-AMBIG-2' });
    const ok = await resolve(t._id, { action: 'approve', flatId: String(F.f5a._id) });
    expect(ok.status).toBe(200);
    expect((await Bill.findById(F.f5a.bill._id)).status).toBe('paid');
    expect((await Bill.findById(F.f5b.bill._id)).paidAmount).toBe(0);
  });
  test('amount larger than the bill balance is refused and the item stays reviewable', async () => {
    const t = await BankTransaction.findOne({ txnId: 'B-NOFLAT' });
    const bad = await resolve(t._id, { action: 'approve', flatId: String(F.f2._id) });
    expect(bad.status).toBe(409);
    expect((await BankTransaction.findById(t._id)).status).toBe('unmatched');
  });
  test('rejecting marks the item rejected and posts nothing', async () => {
    const t = await BankTransaction.findOne({ txnId: 'B-AMBIG-1' });
    const r = await resolve(t._id, { action: 'reject' });
    expect(r.body.transaction.status).toBe('rejected');
    expect(await Payment.countDocuments({ bankTransaction: t._id })).toBe(0);
  });
  test('a matched transaction cannot be re-resolved', async () => {
    const t = await BankTransaction.findOne({ txnId: 'B-EXACT' });
    expect((await resolve(t._id, { action: 'reject' })).status).toBe(409);
  });
});

describe('History and access control', () => {
  test('every upload is kept in reconciliation history', async () => {
    const res = await request(app).get('/api/reconciliation/batches').set(bearer(desk));
    expect(res.status).toBe(200);
    expect(res.body.batches.length).toBeGreaterThanOrEqual(4);
    expect(res.body.batches[0].uploadedBy.name).toBe('Desk Tester');
  });
  test('transaction list returns a status summary', async () => {
    const res = await request(app).get('/api/reconciliation/transactions').set(bearer(desk));
    expect(res.body.summary.matched).toBeGreaterThanOrEqual(3);
  });
  test('residents are forbidden; committee is read-only', async () => {
    expect((await upload([row('B-X', 1, '', '')], resident)).status).toBe(403);
    expect((await upload([row('B-X', 1, '', '')], committee)).status).toBe(403);
    expect((await request(app).get('/api/reconciliation/transactions').set(bearer(committee))).status).toBe(200);
    expect((await request(app).get('/api/reconciliation/transactions')).status).toBe(401);
  });
  test('empty or oversized uploads are rejected by validation', async () => {
    expect((await upload([])).status).toBe(400);
  });
});
