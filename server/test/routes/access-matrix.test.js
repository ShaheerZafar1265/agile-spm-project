/**
 * Role access matrix — every role-guarded endpoint across server/src/routes/,
 * called as a guest and as each role. This table is the access policy: change
 * a route's guard and this test must change with it.
 *
 * Requests use unknown ids or empty bodies, so an allowed call stops at a
 * 404/400 inside the handler and nothing in the store changes. Rules a handler
 * checks itself (an order's owner, chefs editing only availability, cancelling
 * a paid order) are covered in that module's own test file.
 *
 * The super admin holds every admin permission, so its expected access is
 * derived from admin's, never listed by hand. The tests at the bottom check the
 * same inheritance for the admin rules handlers check themselves.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { menuItem, startServer } from '../helpers.js';

const ROLES = ['customer', 'waiter', 'chef', 'manager', 'admin', 'superadmin'];
/** The seeded account bound to the super admin role (store.js SUPERADMIN_EMAIL). */
const SUPERADMIN_LOGIN = ['sabihuddin106@gmail.com', 'Admin@123456'];
const SIGNED_IN = ROLES;
const STAFF = ['waiter', 'chef', 'manager', 'admin'];
const FLOOR = ['waiter', 'manager', 'admin'];
const KITCHEN = ['chef', 'manager', 'admin'];
const MANAGEMENT = ['manager', 'admin'];
const ADMIN = ['admin'];

/** [method, path, roles allowed, body?] — `null` roles means public (guests too). */
const MATRIX = [
  // Public reads
  ['GET', '/menu', null],
  ['GET', '/menu/items', null],
  ['GET', '/menu/categories', null],
  ['GET', '/settings', null],
  ['GET', '/tables/public', null],
  ['GET', '/auth/roles', null],

  // Any signed-in user
  ['GET', '/auth/me', SIGNED_IN],
  ['GET', '/notifications', SIGNED_IN],
  ['POST', '/notifications/read-all', SIGNED_IN],

  // Accounts — self-service, then rank-limited management (rank is checked in the handler)
  ['PATCH', '/auth/me', STAFF, {}],
  ['POST', '/auth/me/password', SIGNED_IN, {}],
  ['PATCH', '/auth/users/usr_nope/profile', MANAGEMENT, {}],
  ['POST', '/auth/users/usr_nope/reset-password', MANAGEMENT, {}],
  ['POST', '/auth/users/usr_nope/password', ADMIN, {}],
  ['GET', '/auth/users', MANAGEMENT],
  ['PATCH', '/auth/users/usr_nope', ADMIN, {}],
  ['DELETE', '/auth/users/usr_nope', ADMIN],

  // Orders & kitchen
  ['GET', '/orders', STAFF],
  ['GET', '/orders/kitchen', STAFF],
  ['PUT', '/orders/ord_nope/items', FLOOR, { items: [] }],
  ['PATCH', '/orders/ord_nope/table', FLOOR, {}],
  ['PATCH', '/orders/ord_nope/items/itm_nope', STAFF, {}],
  ['POST', '/orders/ord_nope/kitchen', KITCHEN, {}],

  // Billing — taking payment is floor work; reversing or refunding it is management
  ['GET', '/billing', FLOOR],
  ['POST', '/billing/ord_nope/tip', FLOOR, {}],
  ['POST', '/billing/ord_nope/split', FLOOR, {}],
  ['DELETE', '/billing/ord_nope/split', FLOOR],
  ['POST', '/billing/ord_nope/split/0/pay', FLOOR, {}],
  ['POST', '/billing/ord_nope/pay', FLOOR, {}],
  ['POST', '/billing/ord_nope/unpay', MANAGEMENT, {}],
  ['POST', '/billing/ord_nope/refund', MANAGEMENT, {}],

  // Customers — floor staff keep the ledger; deleting a record is management
  ['GET', '/customers', FLOOR],
  ['GET', '/customers/cus_nope', FLOOR],
  ['POST', '/customers', FLOOR, {}],
  ['PATCH', '/customers/cus_nope', FLOOR, {}],
  ['DELETE', '/customers/cus_nope', MANAGEMENT],

  // Tables — floor staff run the room; the layout is management
  ['GET', '/tables', FLOOR],
  ['PATCH', '/tables/tbl_nope', FLOOR, {}],
  ['POST', '/tables', MANAGEMENT, {}],
  ['DELETE', '/tables/tbl_nope', MANAGEMENT],

  // Reservations
  ['GET', '/reservations', FLOOR],
  ['PATCH', '/reservations/res_nope', FLOOR, {}],

  // Menu — the kitchen toggles availability; everything else is management
  ['PATCH', '/menu/items/itm_nope', KITCHEN, {}],
  ['POST', '/menu/items', MANAGEMENT, {}],
  ['PUT', '/menu/items/itm_nope/recipe', MANAGEMENT, {}],
  ['DELETE', '/menu/items/itm_nope', MANAGEMENT],
  ['POST', '/menu/categories', MANAGEMENT, {}],
  ['PATCH', '/menu/categories/cat_nope', MANAGEMENT, {}],
  ['DELETE', '/menu/categories/cat_nope', MANAGEMENT],

  // Inventory — the kitchen counts stock; buying and the catalogue are management
  ['GET', '/inventory', KITCHEN],
  ['PATCH', '/inventory/inv_nope', KITCHEN, {}],
  ['GET', '/inventory/movements', KITCHEN],
  ['POST', '/inventory', MANAGEMENT, {}],
  ['DELETE', '/inventory/inv_nope', MANAGEMENT],
  ['GET', '/inventory/reorder', MANAGEMENT],
  ['GET', '/inventory/purchase-orders', MANAGEMENT],
  ['POST', '/inventory/purchase-orders', MANAGEMENT, {}],
  ['POST', '/inventory/purchase-orders/po_nope/receive', MANAGEMENT, {}],

  // Staff — everyone sees their own shifts; rota, hiring and performance are management
  ['GET', '/staff/shifts/mine', STAFF],
  ['GET', '/staff/roster', MANAGEMENT],
  ['GET', '/staff/applications', MANAGEMENT],
  ['POST', '/staff/applications/app_nope/approve', MANAGEMENT, {}],
  ['POST', '/staff/applications/app_nope/reject', MANAGEMENT, {}],
  ['GET', '/staff/shifts', MANAGEMENT],
  ['POST', '/staff/shifts', MANAGEMENT, {}],
  ['PATCH', '/staff/shifts/shf_nope', MANAGEMENT, {}],
  ['DELETE', '/staff/shifts/shf_nope', MANAGEMENT],
  ['GET', '/staff/performance', MANAGEMENT],

  // Attendance — every staff member sees their own clock; presence is scoped
  // per role in the handler (attendance.test.js)
  ['GET', '/attendance/me', STAFF],
  ['GET', '/attendance/presence', STAFF],

  // Workforce — whose records you see is checked per target in the handler
  // (workforce.test.js); wages and bonuses are admin only
  ['GET', '/workforce/me', STAFF],
  ['GET', '/workforce/users/usr_nope', STAFF],
  ['GET', '/workforce/overview', MANAGEMENT],
  ['PUT', '/workforce/users/usr_nope/wage', ADMIN, {}],
  ['POST', '/workforce/users/usr_nope/adjustments', ADMIN, {}],
  ['DELETE', '/workforce/users/usr_nope/adjustments/adj_nope', ADMIN],

  // Analytics & settings
  ['GET', '/analytics/summary', MANAGEMENT],
  ['GET', '/analytics/dashboard', MANAGEMENT],
  ['PATCH', '/settings', MANAGEMENT, {}],
];

let api;
const tokens = {};
before(async () => {
  api = await startServer();
  await Promise.all(ROLES.map(async (role) => {
    tokens[role] = role === 'superadmin' ? await api.login(...SUPERADMIN_LOGIN) : await api.login(role);
  }));
});
after(() => api.close());

/** Whether `who` may call a route open to `allowed`: the super admin wherever an admin may. */
const mayCall = (who, allowed) => allowed.includes(who) || (who === 'superadmin' && allowed.includes('admin'));

test('the super admin caller is the account bound to the superadmin role', async () => {
  // Act
  const me = await api.call('GET', '/auth/me', { token: tokens.superadmin });

  // Assert
  assert.equal(me.body.user.email, SUPERADMIN_LOGIN[0]);
  assert.equal(me.body.user.role, 'superadmin');
});

for (const [method, path, allowed, body] of MATRIX) {
  const label = allowed ? allowed.join('/') : 'everyone';
  test(`${method} ${path} — ${label}`, async () => {
    // Arrange
    const callers = [['guest', undefined], ...ROLES.map((role) => [role, tokens[role]])];

    // Act
    const results = [];
    for (const [who, token] of callers) {
      const { status } = await api.call(method, path, { token, body });
      results.push([who, status]);
    }

    // Assert
    for (const [who, status] of results) {
      const ok = allowed === null || (who !== 'guest' && mayCall(who, allowed));
      if (ok) {
        assert.ok(status !== 401 && status !== 403, `${who} should reach ${method} ${path}, got ${status}`);
      } else {
        assert.equal(status, who === 'guest' ? 401 : 403, `${who} should be refused ${method} ${path}`);
      }
    }
  });
}

/** Routes whose role rules live in the handler; each is tested in its module's file. */
const HANDLER_CHECKED = [
  'PATCH /api/customers/me', // the signed-in customer's own profile — customers.test.js
  'POST /api/orders', // customers order for themselves, floor staff for guests — orders.test.js
  'POST /api/orders/:id/status', // per-transition roles, owner cancel, paid cancel needs a manager — orders.test.js
  'GET /api/reservations/mine', // a customer's own bookings — reservations.test.js
  'POST /api/reservations/:id/cancel', // the booking's owner or floor staff — reservations.test.js
  // Clock transitions change the caller's own state (the seed has people clocked
  // in), so the staff-only check (customers 403, guests 401) is in attendance.test.js
  'POST /api/attendance/clock-in',
  'POST /api/attendance/clock-out',
  'POST /api/attendance/break/start',
  'POST /api/attendance/break/end',
];

/** '/orders/ord_nope/items/itm_nope' → '/api/orders/:id/items/:itemId', as the catalogue names routes. */
const toRoute = (path) => `/api${path
  .replace(/\/items\/itm_nope$/, (m) => (path.startsWith('/orders/') ? '/items/:itemId' : m))
  .replace(/\/adjustments\/adj_nope$/, '/adjustments/:adjId')
  .replace(/\/[a-z]+_nope/g, '/:id')
  .replace(/\/split\/0\//, '/split/:index/')}`;

test('the matrix covers every guarded route in server/src/routes', async () => {
  // Arrange — the live endpoint catalogue lists every registered route
  const { body } = await api.call('GET', '/health/endpoints');
  const endpoints = body.endpoints ?? body;
  const covered = new Set([...MATRIX.map(([m, p]) => `${m} ${toRoute(p)}`), ...HANDLER_CHECKED]);

  // Act
  const missing = endpoints
    .filter((e) => Array.isArray(e.roles) && e.roles.length > 0 && !e.path.startsWith('/api/health'))
    .map((e) => `${e.method} ${e.path}`)
    .filter((key) => !covered.has(key));

  // Assert
  assert.deepEqual(missing, [], 'add these role-guarded routes to MATRIX');
});

/* -------- Admin rules a handler checks itself also admit the super admin -------- */

test('the super admin changes the floor layout and edits ingredient details, like an admin', async () => {
  // Arrange
  const [table] = (await api.call('GET', '/tables', { token: tokens.admin })).body.tables;
  const [ingredient] = (await api.call('GET', '/inventory', { token: tokens.admin })).body.inventory;

  // Act
  const layout = await api.call('PATCH', `/tables/${table.id}`, { token: tokens.superadmin, body: { seats: table.seats } });
  const layoutAsWaiter = await api.call('PATCH', `/tables/${table.id}`, { token: tokens.waiter, body: { seats: table.seats } });
  const details = await api.call('PATCH', `/inventory/${ingredient.id}`, { token: tokens.superadmin, body: { reorderLevel: ingredient.reorderLevel } });
  const detailsAsChef = await api.call('PATCH', `/inventory/${ingredient.id}`, { token: tokens.chef, body: { reorderLevel: ingredient.reorderLevel } });

  // Assert
  assert.equal(layout.status, 200);
  assert.equal(layoutAsWaiter.status, 403);
  assert.equal(details.status, 200);
  assert.equal(detailsAsChef.status, 403);
});

test('the super admin sees recipes and the full settings, like an admin', async () => {
  // Act
  const items = (await api.call('GET', '/menu/items', { token: tokens.superadmin })).body.items;
  const settings = (await api.call('GET', '/settings', { token: tokens.superadmin })).body.settings;
  const waiterSettings = (await api.call('GET', '/settings', { token: tokens.waiter })).body.settings;

  // Assert
  assert.ok(items.length > 0 && items.every((i) => Array.isArray(i.recipe)), 'every item carries its recipe');
  assert.ok('lateGraceMinutes' in settings, 'staff-only settings are included');
  assert.ok(!('lateGraceMinutes' in waiterSettings));
});

test('the super admin is told about new applications and can hire a manager, like an admin', async () => {
  // Arrange
  const applied = await api.call('POST', '/staff/applications', { body: { name: 'Priya Planner', email: 'priya.planner@example.com', desiredRole: 'chef' } });
  const id = applied.body.application.id;

  // Act
  const feed = (await api.call('GET', '/notifications', { token: tokens.superadmin })).body.notifications;
  const asManager = await api.call('POST', `/staff/applications/${id}/approve`, { token: tokens.manager, body: { role: 'manager' } });
  const approved = await api.call('POST', `/staff/applications/${id}/approve`, { token: tokens.superadmin, body: { role: 'manager' } });

  // Assert
  assert.ok(feed.some((n) => n.type === 'application' && n.message.includes('Priya Planner')), 'admin broadcasts reach the super admin');
  assert.equal(asManager.status, 403);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.user.role, 'manager');
});

test('the super admin takes orders, confirms them as their waiter, views bills and cancels paid orders, like an admin', async () => {
  // Arrange
  const pizza = await menuItem(api.call, 'Margherita Pizza');
  const { id: superadminId } = (await api.call('GET', '/auth/me', { token: tokens.superadmin })).body.user;
  const prepaid = (await api.call('POST', '/orders', {
    token: tokens.customer,
    body: { type: 'online', fulfillment: 'pickup', paymentMethod: 'card', items: [{ menuItemId: pizza.id, qty: 1 }] },
  })).body.order;

  // Act
  const staffOrder = await api.call('POST', '/orders', { token: tokens.superadmin, body: { type: 'dine-in', items: [{ menuItemId: pizza.id, qty: 1 }] } });
  const confirmed = await api.call('POST', `/orders/${prepaid.id}/status`, { token: tokens.superadmin, body: { status: 'confirmed' } });
  const bill = await api.call('GET', `/billing/${prepaid.id}`, { token: tokens.superadmin });
  const billAsChef = await api.call('GET', `/billing/${prepaid.id}`, { token: tokens.chef });
  const cancelled = await api.call('POST', `/orders/${prepaid.id}/status`, { token: tokens.superadmin, body: { status: 'cancelled', reason: 'Owner check' } });

  // Assert
  assert.equal(staffOrder.status, 201);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.order.waiterId, superadminId);
  assert.equal(bill.status, 200);
  assert.equal(billAsChef.status, 403);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.order.paymentStatus, 'refunded');
});

test('the super admin cancels a booking, like an admin', async () => {
  // Arrange
  const booking = (await api.call('GET', '/reservations', { token: tokens.admin })).body.reservations
    .find((r) => ['requested', 'confirmed'].includes(r.status));

  // Act
  const asChef = await api.call('POST', `/reservations/${booking.id}/cancel`, { token: tokens.chef });
  const cancelled = await api.call('POST', `/reservations/${booking.id}/cancel`, { token: tokens.superadmin });

  // Assert
  assert.equal(asChef.status, 403);
  assert.equal(cancelled.status, 200);
});
