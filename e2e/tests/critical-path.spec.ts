import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Critical-path journeys (bolt 001), run against production builds.
 *
 * One order travels the whole way through the real stack — browser, Next.js
 * /api proxy, Express API, session cookie, seeded in-memory state:
 *
 *   customer places a pickup order  ->  waiter confirms it  ->  chef sees it in the kitchen
 *
 * The accounts are the public demo seeds from the README (server/src/data/store.js),
 * used only against the throwaway in-memory API this suite starts itself.
 */

const DEMO_PASSWORD = 'password';

/** Opens a fresh, isolated browser session signed in as a seeded demo account. */
async function signInAs(browser: Browser, email: string, landing: string | RegExp): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(typeof landing === 'string' ? new RegExp(`${landing}$`) : landing);
  return page;
}

test.describe.serial('critical path: order -> confirm -> kitchen', () => {
  let orderNumber = '';

  test('customer signs in, places a pickup order and finds it in My account', async ({ browser }) => {
    // Arrange
    const page = await signInAs(browser, 'customer@rest.test', '/');

    // Act: add the first available dish and check out for pickup, paying by cash
    await page.goto('/menu');
    await page.getByRole('button', { name: /^Add .+ to order$/ }).first().click();
    const options = page.getByRole('dialog');
    if (await options.isVisible({ timeout: 1_000 }).catch(() => false)) {
      // The dish has modifiers: accept the defaults.
      await options.getByRole('button').last().click();
    }
    await page.getByRole('button', { name: /^View your order/ }).click();
    await page.getByRole('button', { name: /^Checkout/ }).click();
    await page.getByRole('radio', { name: /Pickup/ }).click();
    await page.getByRole('radio', { name: /Cash/ }).click();
    await page.getByRole('button', { name: /place order/i }).click();

    // Assert: the API accepted it and showed an order number
    const received = page.getByRole('heading', { name: /Order #\d+ received/ });
    await expect(received).toBeVisible();
    orderNumber = ((await received.textContent()) ?? '').match(/#(\d+)/)?.[1] ?? '';
    expect(orderNumber).not.toBe('');

    // Assert: it is listed for this customer (session cookie + proxy + API read)
    await page.goto('/account#orders');
    await expect(page.getByRole('heading', { name: `Order #${orderNumber}` })).toBeVisible();
    await page.context().close();
  });

  test('waiter confirms the order and it is sent to the kitchen', async ({ browser }) => {
    // Arrange
    expect(orderNumber, 'the customer journey must run first').not.toBe('');
    const page = await signInAs(browser, 'waiter@rest.test', /\/staff$/);

    // Act
    await page.goto('/staff/orders');
    const card = page.getByLabel(`Order #${orderNumber}`, { exact: true });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Confirm', exact: true }).click();

    // Assert
    await expect(page.getByText(`Order #${orderNumber} confirmed and sent to the kitchen.`)).toBeVisible();
    await page.context().close();
  });

  test('chef sees the confirmed order in the kitchen queue and starts it', async ({ browser }) => {
    // Arrange
    expect(orderNumber, 'the customer journey must run first').not.toBe('');
    const page = await signInAs(browser, 'chef@rest.test', /\/staff$/);

    // Act
    await page.goto('/staff/kitchen');
    const ticket = page.getByLabel(new RegExp(`^Order #${orderNumber}, queue position`));
    await expect(ticket).toBeVisible();
    await ticket.getByRole('button', { name: 'Start all' }).click();

    // Assert
    await expect(page.getByText(`Order #${orderNumber} started.`)).toBeVisible();
    await page.context().close();
  });

  test('a customer cannot open the staff kitchen display', async ({ browser }) => {
    // Arrange
    const page = await signInAs(browser, 'customer@rest.test', '/');

    // Act
    await page.goto('/staff/kitchen');

    // Assert: sent back to the storefront, and the kitchen display never renders
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Kitchen display')).toHaveCount(0);
    await page.context().close();
  });
});
