const request = require('supertest');
const db = require('./helpers/db');
const app = require('../app');
const { makeFlat, makeUser, makeBill, bearer } = require('./helpers/factory');
const { calcMonthlyBill, calcLateFee } = require('../utils/billing');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');

let flat, other, resident, otherRes, desk, committee, bill;

beforeAll(async () => {
  await db.connect('society360_test_billing');
  flat = await makeFlat({ areaSqft: 980 });
  other = await makeFlat({ areaSqft: 1150 });
  resident = await makeUser('resident', { flat: flat._id });
  otherRes = await makeUser('resident', { flat: other._id });
  desk = await makeUser('helpdesk');
  committee = await makeUser('committee');
  bill = await makeBill(flat, { daysOverdue: 47 });
});
afterAll(db.disconnect);

describe('Billing rules', () => {
  test('maintenance = area x 6.50 (client sample figures)', () => {
    expect(calcMonthlyBill(1150)).toBe(7475);
    expect(calcMonthlyBill(980)).toBe(6370);
    expect(calcMonthlyBill(1640)).toBe(10660);
  });
  test('late fee is configurable, zero inside grace period and zero when balance is cleared', () => {
    expect(calcLateFee(6370, 5)).toBe(0);
    expect(calcLateFee(0, 90)).toBe(0);
    expect(calcLateFee(6370, 47, { graceDays: 10, percentPerMonth: 1.5 })).toBe(118);
    expect(calcLateFee(6370, 47, { graceDays: 10, percentPerMonth: 3 })).toBe(236);
  });
  test('bill list shows balance, days overdue and late fee', async () => {
    const res = await request(app).get(`/api/flats/${flat._id}/bills`).set(bearer(resident));
    expect(res.status).toBe(200);
    expect(res.body.bills[0]).toMatchObject({ amount: 6370, balance: 6370, daysOverdue: 47, lateFee: 118 });
  });
});

describe('Mock payments', () => {
  test('partial payment updates balance, status, reference and timestamp', async () => {
    const res = await request(app).post('/api/payments/mock').set(bearer(resident))
      .send({ billId: String(bill._id), amount: 2000, clientRequestId: 'req-partial-0001' });
    expect(res.status).toBe(201);
    expect(res.body.bill).toMatchObject({ paidAmount: 2000, balance: 4370, status: 'partial' });
    expect(res.body.payment.txnRef).toMatch(/^MOCK-/);
    expect(res.body.payment.receiptNo).toMatch(/^RCT-/);
    expect(new Date(res.body.payment.paidAt).getTime()).toBeGreaterThan(0);
  });
  test('replaying the same request is idempotent: no duplicate payment or double debit', async () => {
    const res = await request(app).post('/api/payments/mock').set(bearer(resident))
      .send({ billId: String(bill._id), amount: 2000, clientRequestId: 'req-partial-0001' });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect((await Bill.findById(bill._id)).paidAmount).toBe(2000);
    expect(await Payment.countDocuments({ flat: flat._id })).toBe(1);
  });
  test('overpayment is rejected and balance is unchanged', async () => {
    const res = await request(app).post('/api/payments/mock').set(bearer(resident))
      .send({ billId: String(bill._id), amount: 9999, clientRequestId: 'req-overpay-0001' });
    expect(res.status).toBe(409);
    expect((await Bill.findById(bill._id)).paidAmount).toBe(2000);
  });
  test('concurrent payments can never overpay the bill', async () => {
    const results = await Promise.all([1, 2, 3].map((i) =>
      request(app).post('/api/payments/mock').set(bearer(resident))
        .send({ billId: String(bill._id), amount: 3000, clientRequestId: `req-race-000${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const b = await Bill.findById(bill._id);
    expect(b.paidAmount).toBeLessThanOrEqual(b.amount);
  });
  test('paying the remainder marks the bill paid', async () => {
    const b = await Bill.findById(bill._id);
    const res = await request(app).post('/api/payments/mock').set(bearer(resident))
      .send({ billId: String(bill._id), amount: b.amount - b.paidAmount, clientRequestId: 'req-final-00001' });
    expect(res.status).toBe(201);
    expect(res.body.bill).toMatchObject({ balance: 0, status: 'paid', lateFee: 0 });
  });
  test("resident cannot pay another flat's bill", async () => {
    const ob = await makeBill(other, { daysOverdue: 3 });
    const res = await request(app).post('/api/payments/mock').set(bearer(resident))
      .send({ billId: String(ob._id), amount: 100, clientRequestId: 'req-forbid-0001' });
    expect(res.status).toBe(403);
  });
  test('committee and help desk cannot make resident payments', async () => {
    const body = { billId: String(bill._id), amount: 1, clientRequestId: 'req-staff-00001' };
    expect((await request(app).post('/api/payments/mock').set(bearer(committee)).send(body)).status).toBe(403);
    expect((await request(app).post('/api/payments/mock').set(bearer(desk)).send(body)).status).toBe(403);
  });
});

describe('Ledger, receipts and ownership', () => {
  test('ledger has debits, credits and a running balance that ends at zero', async () => {
    const res = await request(app).get(`/api/flats/${flat._id}/ledger`).set(bearer(resident));
    expect(res.status).toBe(200);
    expect(res.body.entries[0].type).toBe('bill');
    expect(res.body.entries.at(-1).balance).toBe(0);
    expect(res.body.summary.outstanding).toBe(0);
  });
  test('receipt is generated for own payment, hidden from other residents', async () => {
    const p = await Payment.findOne({ flat: flat._id });
    const ok = await request(app).get(`/api/payments/${p._id}/receipt`).set(bearer(resident));
    expect(ok.status).toBe(200);
    expect(ok.body.receipt).toMatchObject({ flatNumber: flat.flatNumber, receiptNo: p.receiptNo });
    expect((await request(app).get(`/api/payments/${p._id}/receipt`).set(bearer(otherRes))).status).toBe(403);
  });
  test("resident cannot read another flat's ledger or bills", async () => {
    expect((await request(app).get(`/api/flats/${other._id}/ledger`).set(bearer(resident))).status).toBe(403);
    expect((await request(app).get(`/api/flats/${other._id}/bills`).set(bearer(resident))).status).toBe(403);
  });
  test('resident dashboard returns the resident own data only', async () => {
    const res = await request(app).get('/api/dashboard/resident').set(bearer(otherRes));
    expect(res.status).toBe(200);
    expect(res.body.flat.flatNumber).toBe(other.flatNumber);
    expect(res.body.paymentStatus).toBe('Overdue');
    expect((await request(app).get('/api/dashboard/resident').set(bearer(desk))).status).toBe(403);
  });
});
