import { test, expect, type Page } from '@playwright/test';

/** Disable auto-print (popups) so flows run headless-deterministically. */
export async function login(page: Page, username: string, password: string, opts?: { employee?: boolean }) {
  await page.addInitScript(() => {
    localStorage.setItem('kstore_printer_config', JSON.stringify({ autoPrint: false, openCashDrawer: false }));
  });
  await page.goto('/#/');
  await page.waitForSelector('.kmenu, .login-card', { timeout: 30000 });
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  if (opts?.employee) {
    // §4 — cashiers are gated behind the Start Shift modal before the POS unlocks.
    const startBtn = page.getByRole('button', { name: 'بدء الشيفت' });
    await startBtn.first().waitFor({ timeout: 30000 });
    // fill opening cash amount
    const inputs = page.locator('.kmodal input[type=number]');
    if (await inputs.count()) await inputs.first().fill('100');
    await startBtn.first().click();
    await expect(page.getByPlaceholder('باركود / اسم صنف — Enter للبحث')).toBeVisible({ timeout: 30000 });
  } else {
    await expect(page.getByText('سجل الطلبات').first()).toBeVisible({ timeout: 30000 });
  }
}

export async function gotoApp(page: Page, hash: string) {
  // Hash assignment (not page.goto): CDP same-document navigations don't
  // reliably fire the events HashRouter listens for.
  await page.evaluate((h) => { window.location.hash = '#' + h; }, hash);
  await expect(page).toHaveURL(new RegExp(`#${hash}$`), { timeout: 10000 });
  await page.waitForSelector('.kmenu, .denied, .login-card', { timeout: 30000 });
}
