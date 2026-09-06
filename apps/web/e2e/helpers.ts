import { test, expect, type Page } from '@playwright/test';

/** Disable auto-print (popups) so flows run headless-deterministically. */
export async function login(page: Page, username: string, password: string) {
  await page.addInitScript(() => {
    localStorage.setItem('kstore_printer_config', JSON.stringify({ autoPrint: false, openCashDrawer: false }));
  });
  await page.goto('/#/');
  await page.waitForSelector('.kmenu, .login-card', { timeout: 30000 });
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByText('سجل الطلبات').first()).toBeVisible({ timeout: 30000 });
}

export async function gotoApp(page: Page, hash: string) {
  await page.goto(`/#${hash}`);
  await page.waitForSelector('.kmenu', { timeout: 30000 });
}
