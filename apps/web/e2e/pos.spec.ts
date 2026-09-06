import { test, expect } from '@playwright/test';
import { login, gotoApp } from './helpers';

test('confirm order → appears in orders log', async ({ page }) => {
  await login(page, 'cashier', 'cashier123');
  await page.getByRole('link', { name: 'طلب جديد' }).click();
  // search seed product سكر 1ك (barcode 100002) and add it
  await page.getByPlaceholder('باركود / اسم صنف — Enter للبحث').fill('100002');
  await page.getByRole('button', { name: 'بحث' }).click();
  await page.getByRole('button', { name: '+ إضافة' }).first().click();
  await expect(page.locator('.ktotal-box')).not.toHaveText('0.00');
  await page.keyboard.press('F12');
  await expect(page.getByText(/تم تأكيد الطلب رقم/)).toBeVisible({ timeout: 20000 });
  // print copy of the just-confirmed order (same number, no new order)
  await page.getByRole('button', { name: 'طباعة نسخة' }).click();
  await expect(page.getByText(/تم إرسال نسخة الفاتورة رقم/)).toBeVisible({ timeout: 20000 });
  // order visible in log
  await page.getByRole('link', { name: 'سجل الطلبات' }).click();
  await expect(page.locator('.ktable tbody tr').first()).toBeVisible();
});

test('hold order → pending tab → confirm from detail', async ({ page }) => {
  await login(page, 'cashier', 'cashier123');
  await page.getByRole('link', { name: 'طلب جديد' }).click();
  await page.getByPlaceholder('باركود / اسم صنف — Enter للبحث').fill('100002');
  await page.getByRole('button', { name: 'بحث' }).click();
  await page.getByRole('button', { name: '+ إضافة' }).first().click();
  await page.keyboard.press('F9');
  await expect(page.getByText(/تم تعليق الفاتورة/)).toBeVisible({ timeout: 20000 });
  await page.getByRole('link', { name: 'سجل الطلبات' }).click();
  await page.getByRole('button', { name: /الطلبات المعلقة/ }).click();
  const row = page.locator('.ktable tbody tr').first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await row.click();
  await page.getByRole('button', { name: 'تأكيد', exact: true }).click();
  await expect(page.getByText(/تم تعليق الفاتورة|تأكيد/)).toBeHidden({ timeout: 20000 });
});

test('cashier blocked from users page, admin allowed', async ({ page }) => {
  await login(page, 'cashier', 'cashier123');
  await gotoApp(page, '/users');
  await expect(page.getByText('غير مصرح')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'خروج' }).click();
  await expect(page.getByTestId('login-username')).toBeVisible({ timeout: 20000 });
  await login(page, 'admin', 'admin123');
  await gotoApp(page, '/users');
  await expect(page.getByText('المستخدمون').first()).toBeVisible({ timeout: 20000 });
});
