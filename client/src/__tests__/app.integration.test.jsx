/**
 * End-to-end UI check: renders the real React app against a RUNNING Society360 API
 * seeded with `npm run seed`. Start the API with CLIENT_ORIGIN=http://localhost:3000 and set
 * VITE_API_URL (e.g. http://localhost:5055/api). Mutates the database: re-seed afterwards.
 */
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';

const API = process.env.VITE_API_URL;
const mount = (route) => render(<MemoryRouter initialEntries={[route]}><AuthProvider><App /><Toaster /></AuthProvider></MemoryRouter>);
const signIn = async (email) => {
  const { data } = await axios.post(`${API}/auth/login`, { email, password: 'Demo@1234' });
  localStorage.setItem('society360_token', data.token);
};
const find = (text, opts) => screen.findByText(text, opts, { timeout: 15000 });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('Login and access control', () => {
  test('login form signs in and redirects by role', async () => {
    const user = userEvent.setup();
    mount('/login');
    await user.type(screen.getByLabelText('Email'), 'helpdesk@society360.demo');
    await user.type(screen.getByLabelText('Password'), 'Demo@1234');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Help desk' }, { timeout: 15000 })).toBeInTheDocument();
  });
  test('wrong password shows an error', async () => {
    const user = userEvent.setup();
    mount('/login');
    await user.type(screen.getByLabelText('Email'), 'swati@society360.demo');
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await find('Invalid email or password')).toBeInTheDocument();
  });
  test('committee demo button signs in read-only committee', async () => {
    const user = userEvent.setup();
    mount('/login');
    await user.click(screen.getByRole('button', { name: /committee member/i }));
    expect(await screen.findByRole('heading', { name: 'Committee overview' }, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
  });
  test('unauthenticated users are sent to login; residents cannot open staff pages', async () => {
    mount('/billing');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    cleanup();
    await signIn('swati@society360.demo');
    mount('/helpdesk');
    expect(await screen.findByText(/Hello, Swati/, {}, { timeout: 15000 })).toBeInTheDocument();
  });
});

describe('Resident: dashboard, billing and payment', () => {
  test('dashboard shows the client sample figures for Swati (T12-0408)', async () => {
    await signIn('swati@society360.demo');
    mount('/resident');
    expect(await find(/Hello, Swati/)).toBeInTheDocument();
    expect(screen.getByText(/Flat T12-0408 · Tower T12/)).toBeInTheDocument();
    expect(screen.getAllByText('₹6,370').length).toBeGreaterThan(0);
    expect(screen.getByText('47 days overdue')).toBeInTheDocument();
    for (const t of ['Pay maintenance', 'View bills', 'Raise complaint', 'Track complaint']) expect(screen.getByText(t)).toBeInTheDocument();
  });
  test("Aamir's partial payment: paid ₹5,000, balance ₹5,660", async () => {
    await signIn('aamir@society360.demo');
    mount('/billing');
    expect(await find('Total billed')).toBeInTheDocument();
    expect((await screen.findAllByText('₹5,660')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹10,660').length).toBeGreaterThan(0);
  });
  test('pay part of a bill, see confirmation, open the receipt, and the balance updates', async () => {
    const user = userEvent.setup();
    await signIn('swati@society360.demo');
    mount('/billing');
    await user.click(await screen.findByRole('button', { name: 'Pay now' }, { timeout: 15000 }));
    const amount = screen.getByLabelText(/Amount to pay/);
    await user.clear(amount); await user.type(amount, '1000');
    await user.click(screen.getByRole('button', { name: /Pay ₹1,000/ }));
    expect(await find('Payment confirmed')).toBeInTheDocument();
    expect(screen.getByText('Remaining balance: ₹5,370')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /View receipt/ }));
    expect(await find('Payment receipt')).toBeInTheDocument();
    expect(await screen.findByText(/^RCT-/)).toBeInTheDocument();
  });
  test('overpayment is blocked in the form', async () => {
    const user = userEvent.setup();
    await signIn('swati@society360.demo');
    mount('/billing');
    await user.click(await screen.findByRole('button', { name: 'Pay now' }, { timeout: 15000 }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText(/Amount to pay/);
    await user.clear(amount); await user.type(amount, '999999');
    expect(await screen.findByText(/cannot exceed the balance/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Pay/ })).toBeDisabled();
  });
});

describe('Resident: complaints', () => {
  test('a normal complaint without Gemini falls back to Other with a manual-review notice', async () => {
    const user = userEvent.setup();
    await signIn('neeraj@society360.demo');
    mount('/complaints?new=1');
    await user.type(await screen.findByLabelText('Title'), 'Kitchen cabinet hinge broken');
    await user.type(screen.getByLabelText('Description'), 'The hinge on the kitchen cabinet came off and the door is hanging loose');
    await user.click(screen.getByRole('button', { name: 'Submit complaint' }));
    expect((await screen.findAllByText(/Automatic classification was unavailable/, {}, { timeout: 15000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Other').length).toBeGreaterThan(0);
  });
  test('an emergency keyword is escalated as Critical to the duty manager', async () => {
    const user = userEvent.setup();
    await signIn('neeraj@society360.demo');
    mount('/complaints?new=1');
    await user.type(await screen.findByLabelText('Title'), 'Smell in the lobby');
    await user.type(screen.getByLabelText('Description'), 'There is a strong gas leak smell near the lift lobby on our floor');
    await user.click(screen.getByRole('button', { name: 'Submit complaint' }));
    expect(await find(/Emergency detected: Gas leak/)).toBeInTheDocument();
    expect(screen.getByText(/escalated to the duty manager/)).toBeInTheDocument();
    expect(screen.getByText('Critical urgency')).toBeInTheDocument();
  });
  test('validation messages appear for a too-short complaint', async () => {
    const user = userEvent.setup();
    await signIn('neeraj@society360.demo');
    mount('/complaints?new=1');
    await user.click(await screen.findByRole('button', { name: 'Submit complaint' }));
    expect(await screen.findByText(/Add a short title/)).toBeInTheDocument();
  });
  test('tracking: list shows own complaints and the detail shows history', async () => {
    const user = userEvent.setup();
    await signIn('neeraj@society360.demo');
    mount('/complaints');
    await user.click(await find('Water leaking from bathroom ceiling', {}, { timeout: 15000 }));
    expect(await find('Complaint details')).toBeInTheDocument();
    expect(await find('Complaint raised')).toBeInTheDocument();
  });
});

describe('Help desk', () => {
  test('dashboard stats, filters and complaint management', async () => {
    const user = userEvent.setup();
    await signIn('helpdesk@society360.demo');
    mount('/helpdesk');
    expect(await find('Total complaints')).toBeInTheDocument();
    for (const t of ['Assignment queue', 'Response timers', 'Recent activity']) expect(screen.getByText(t)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Priority'), 'Critical');
    await waitFor(() => expect(screen.queryByText('Corridor lights not working')).not.toBeInTheDocument(), { timeout: 15000 });
    expect((await screen.findAllByText(/Gas leak smell in corridor/, {}, { timeout: 15000 })).length).toBeGreaterThan(0);
    await user.click((await screen.findAllByText('Gas leak smell in corridor'))[0]);
    expect(await find('Manage complaint')).toBeInTheDocument();
    expect(await screen.findByText('Emergency: locked at Critical', {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Priority', { selector: '#urg' })).toBeDisabled();
  });
  test('staff can change category and update status', async () => {
    const user = userEvent.setup();
    await signIn('helpdesk@society360.demo');
    mount('/helpdesk');
    await user.type(await screen.findByLabelText('Search'), 'Noise from club house');
    const hit = (await screen.findAllByText(/Noise from club house/, {}, { timeout: 15000 })).find((el) => el.closest('tr'));
    await user.click(hit);
    const dialog = await screen.findByRole('dialog', {}, { timeout: 15000 });
    await user.selectOptions(within(dialog).getByLabelText('Category'), 'Security');
    expect(await screen.findByText('Category updated')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'In Progress' }));
    expect(await screen.findByText('Marked In Progress')).toBeInTheDocument();
  });
});

describe('Bank reconciliation', () => {
  test('uploading the sample CSV matches, queues for review, and detects duplicates', async () => {
    const user = userEvent.setup();
    await signIn('helpdesk@society360.demo');
    mount('/reconciliation');
    const csv = fs.readFileSync(path.resolve(__dirname, '../../public/sample-bank-statement.csv'), 'utf8');
    await user.upload(await screen.findByLabelText(/Choose CSV file/), new File([csv], 'sample-bank-statement.csv', { type: 'text/csv' }));
    expect(await find(/rows read/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Match transactions' }));
    expect(await find(/Processed/, {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText(/2 matched and posted, 5 waiting for review, 1 duplicates ignored/)).toBeInTheDocument();
    expect(screen.getByText('Duplicates detected, not processed again')).toBeInTheDocument();
    expect((await screen.findAllByText('Manual review')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Review' }).length).toBeGreaterThanOrEqual(5), { timeout: 15000 });
  });
  test('reviewing an ambiguous item offers candidate flats and approving posts it', async () => {
    const user = userEvent.setup();
    await signIn('helpdesk@society360.demo');
    mount('/reconciliation');
    const rows = await screen.findAllByRole('row', {}, { timeout: 15000 });
    const target = rows.find((r) => within(r).queryByText('HDFC24120006'));
    expect(target).toBeTruthy();
    await user.click(within(target).getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Multiple flats match/)).toBeInTheDocument();
    const radios = await within(dialog).findAllByRole('radio', {}, { timeout: 15000 });
    await user.click(radios.find((r) => !r.disabled));
    await user.click(within(dialog).getByRole('button', { name: /Approve & post payment/ }));
    expect(await find('Payment posted')).toBeInTheDocument();
  });
});

describe('Committee dashboard', () => {
  test('metrics come from the API and the charts render', async () => {
    await signIn('committee@society360.demo');
    mount('/committee');
    expect(await find('Total billed', {}, { timeout: 15000 })).toBeInTheDocument();
    for (const t of ['Total collected', 'Outstanding', 'Collection', 'Paid flats', 'Unpaid flats', 'Dues ageing', 'Average resolution time', 'By category']) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    expect(screen.getByText('Above 90 days')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign|approve|close/i })).not.toBeInTheDocument();
  });
});
