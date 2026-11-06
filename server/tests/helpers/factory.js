const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Flat = require('../../models/Flat');
const Bill = require('../../models/Bill');
const { signToken } = require('../../utils/token');
const { calcMonthlyBill } = require('../../utils/billing');

let seq = 0;
const next = () => ++seq;

async function makeFlat(o = {}) {
  const n = next();
  const tower = o.tower || `T${String((n % 28) + 1).padStart(2, '0')}`;
  return Flat.create({
    flatNumber: o.flatNumber || `${tower}-${String(1000 + n)}`,
    tower, areaSqft: o.areaSqft ?? 1000, ownerName: o.ownerName || `Owner ${n}`, upiIds: o.upiIds || [],
  });
}

async function makeUser(role, o = {}) {
  const n = next();
  const passwordHash = await bcrypt.hash('Demo@1234', 4);
  return User.create({
    name: o.name || `${role} ${n}`, email: o.email || `${role}${n}@test.local`, passwordHash, role,
    flat: o.flat || null, isDutyManager: !!o.isDutyManager,
  });
}

async function makeBill(flat, o = {}) {
  const now = new Date();
  const due = new Date(now.getTime() - (o.daysOverdue ?? 0) * 86400000);
  const period = o.period || `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, '0')}`;
  const amount = calcMonthlyBill(flat.areaSqft);
  const paid = o.paid || 0;
  return Bill.create({
    flat: flat._id, period, areaSqft: flat.areaSqft, ratePerSqft: 6.5, amount, paidAmount: paid, dueDate: due,
    status: paid >= amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
  });
}

const bearer = (user) => ({ Authorization: `Bearer ${signToken(user)}` });

module.exports = { makeFlat, makeUser, makeBill, bearer };
