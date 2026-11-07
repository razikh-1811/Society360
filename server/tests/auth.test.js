const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('./helpers/db');
const app = require('../app');
const User = require('../models/User');
const Flat = require('../models/Flat');
const { signToken } = require('../utils/token');

let flatA, flatB, resident, helpdesk, committee;

beforeAll(async () => {
  await db.connect('society360_test_auth');
  flatA = await Flat.create({ flatNumber: 'T07-1203', tower: 'T07', areaSqft: 1150, ownerName: 'Neeraj Kulkarni' });
  flatB = await Flat.create({ flatNumber: 'T12-0408', tower: 'T12', areaSqft: 980, ownerName: 'Swati Joshi' });
  const passwordHash = await bcrypt.hash('Demo@1234', 10);
  resident = await User.create({ name: 'Neeraj', email: 'neeraj@demo.test', passwordHash, role: 'resident', flat: flatA._id });
  helpdesk = await User.create({ name: 'Desk', email: 'desk@demo.test', passwordHash, role: 'helpdesk' });
  committee = await User.create({ name: 'Committee', email: 'committee@demo.test', passwordHash, role: 'committee' });
});
afterAll(db.disconnect);

const bearer = (u) => ({ Authorization: `Bearer ${signToken(u)}` });

describe('Authentication', () => {
  test('valid login returns a JWT and user without password hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'neeraj@demo.test', password: 'Demo@1234' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.role).toBe('resident');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  test('passwords are stored hashed, never plaintext', async () => {
    const u = await User.findOne({ email: 'neeraj@demo.test' }).select('+passwordHash');
    expect(u.passwordHash).not.toBe('Demo@1234');
    expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test('invalid password and unknown email give the same 401', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'neeraj@demo.test', password: 'wrong' });
    const b = await request(app).post('/api/auth/login').send({ email: 'nobody@demo.test', password: 'wrong' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  test('malformed login body is rejected with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('committee demo access returns a committee token', async () => {
    const res = await request(app).post('/api/auth/demo-committee');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('committee');
  });

  test('committee demo access can be switched off with DEMO_COMMITTEE_ACCESS=false', async () => {
    process.env.DEMO_COMMITTEE_ACCESS = 'false';
    try {
      expect((await request(app).post('/api/auth/demo-committee')).status).toBe(404);
    } finally {
      delete process.env.DEMO_COMMITTEE_ACCESS;
    }
  });
});

describe('Unauthorized access', () => {
  test('no token => 401', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
  test('garbage token => 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });
  test('valid token returns current user', async () => {
    const res = await request(app).get('/api/auth/me').set(bearer(resident));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('neeraj@demo.test');
  });
});

describe('Role-based restrictions and flat ownership', () => {
  test('resident cannot list all flats', async () => {
    expect((await request(app).get('/api/flats').set(bearer(resident))).status).toBe(403);
  });
  test('helpdesk and committee can list flats', async () => {
    expect((await request(app).get('/api/flats').set(bearer(helpdesk))).status).toBe(200);
    expect((await request(app).get('/api/flats').set(bearer(committee))).status).toBe(200);
  });
  test('resident can read their own flat', async () => {
    const res = await request(app).get(`/api/flats/${flatA._id}`).set(bearer(resident));
    expect(res.status).toBe(200);
    expect(res.body.flat.flatNumber).toBe('T07-1203');
  });
  test("resident cannot read another resident's flat", async () => {
    const res = await request(app).get(`/api/flats/${flatB._id}`).set(bearer(resident));
    expect(res.status).toBe(403);
  });
  test('role is read from the database, not trusted from the token', async () => {
    const forged = signToken({ _id: resident._id, role: 'helpdesk', flat: null });
    const res = await request(app).get('/api/flats').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(403);
  });
});
