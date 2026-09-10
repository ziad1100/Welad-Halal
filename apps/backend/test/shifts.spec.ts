/**
 * Section 4 + 3 tests — Shift & Cash Drawer Reconciliation + Smart Alerts.
 * Requires DATABASE_URL (local Docker DB). Run: npm test -- shift
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Shifts & Alerts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken = '';
  let employeeToken = '';
  let employeeUserId = '';
  let productId = '';
  const BC = `__SH${Date.now().toString(36)}_`;
  const OWNER_PW = `${BC}ownerpass1`;

  async function clean() {
    const shifts = await prisma.shift.findMany({ where: { employee: { user: { username: { contains: BC } } } }, select: { id: true } });
    if (shifts.length) {
      await prisma.auditLog.deleteMany({ where: { entity: 'Shift', entityId: { in: shifts.map((s) => s.id) } } });
      await prisma.alert.deleteMany({ where: { OR: shifts.map((s) => ({ payload: { path: ['shiftId'], equals: s.id } })) } });
      await prisma.shift.deleteMany({ where: { id: { in: shifts.map((s) => s.id) } } });
    }
    await prisma.user.deleteMany({ where: { username: { contains: BC } } });
    const ids = (await prisma.product.findMany({ where: { barcode: { startsWith: BC } }, select: { id: true } })).map((p) => p.id);
    if (ids.length) {
      await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
      await prisma.order.deleteMany({ where: { notes: { contains: BC } } });
      await prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventory.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.systemSetting.deleteMany({ where: { key: 'cash_discrepancy_threshold' } });
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const bcrypt = await import('bcryptjs');
    await prisma.user.update({
      where: { username: 'احمد الصياد' },
      data: { passwordHash: await bcrypt.hash(OWNER_PW, 10), forcePasswordChange: false },
    });
    await prisma.loginAttempt.deleteMany({ where: { username: { contains: BC } } });
    await prisma.loginAttempt.deleteMany({ where: { username: 'احمد الصياد' } });
    await clean();
    const o = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'احمد الصياد', password: OWNER_PW }).expect(201);
    ownerToken = o.body.token;
    const e = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'cashier', password: 'cashier123' }).expect(201);
    employeeToken = e.body.token;
    employeeUserId = e.body.user.id;
    const p = await request(app.getHttpServer()).post('/api/products').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `${BC}prod`, barcode: `${BC}001`, retailPrice: 100, purchasePrice: 50, quantity: 100 }).expect(201);
    productId = p.body.id;
  }, 60000);

  afterAll(async () => {
    await clean();
    await prisma.user.update({
      where: { username: 'احمد الصياد' },
      data: { passwordHash: await (await import('bcryptjs')).hash(`${BC}x`, 10), forcePasswordChange: true },
    }).catch(() => {});
    await prisma.loginAttempt.deleteMany({ where: { username: { contains: BC } } });
    await app.close();
  });

  // supertest chains the header AFTER the verb (.get/.post), so bind it there.
  function auth(t: string) {
    const base: any = request(app.getHttpServer());
    const hdr = (r: any) => r.set('Authorization', `Bearer ${t}`);
    return {
      get: (u: string) => hdr(base.get(u)),
      post: (u: string) => hdr(base.post(u)),
      patch: (u: string) => hdr(base.patch(u)),
      delete: (u: string) => hdr(base.delete(u)),
    };
  }

  test('employee blocked from shift history (level 50)', async () => {
    await auth(employeeToken).get('/api/shifts').expect(403);
    await auth(employeeToken).get('/api/alerts').expect(403);
  });

  test('open shift → confirmed sale raises expected cash', async () => {
    const open = await auth(employeeToken).post('/api/shifts/open').send({ openingCashAmount: 500 }).expect(201);
    expect(open.body.status).toBe('open');
    expect(Number(open.body.openingCashAmount)).toBe(500);
    // second open rejected
    await auth(employeeToken).post('/api/shifts/open').send({ openingCashAmount: 1 }).expect(409);

    await auth(employeeToken).post('/api/orders').send({ status: 'CONFIRMED', notes: `${BC} sale1`, items: [{ productId, quantity: 2 }] }).expect(201);

    const cur = await auth(employeeToken).get('/api/shifts/me/current/expected').expect(200);
    expect(cur.body.shift).toBeTruthy();
    expect(cur.body.sales).toBe(200);
    expect(cur.body.expectedCash).toBe(700);
  });

  test('cancel of confirmed order counts as refund against the drawer', async () => {
    const order = await auth(employeeToken).post('/api/orders').send({ status: 'CONFIRMED', notes: `${BC} sale2`, items: [{ productId, quantity: 1 }] }).expect(201);
    await auth(employeeToken).post(`/api/orders/${order.body.id}/cancel`).expect(201);
    const cur = await auth(employeeToken).get('/api/shifts/me/current/expected').expect(200);
    expect(cur.body.sales).toBe(200);
    expect(cur.body.refunds).toBe(100);
    expect(cur.body.expectedCash).toBe(600);
  });

  test('§4 card orders never touch the drawer: expected cash unchanged', async () => {
    const cur = await auth(employeeToken).get('/api/shifts/me/current/expected').expect(200);
    const before = Number(cur.body.expectedCash);
    await auth(employeeToken).post('/api/orders').send({ status: 'CONFIRMED', notes: `${BC} card1`, paymentMethod: 'CARD', items: [{ productId, quantity: 3 }] }).expect(201);
    const after = await auth(employeeToken).get('/api/shifts/me/current/expected').expect(200);
    expect(Number(after.body.expectedCash)).toBe(before);
  });

  test('close within threshold → no CRITICAL alert; numbers persisted', async () => {
    const cur = await auth(employeeToken).get('/api/shifts/me/current/expected').expect(200);
    const shiftId = cur.body.shift.id;
    const closed = await auth(employeeToken).post(`/api/shifts/${shiftId}/close`).send({ closingCashAmount: 600 }).expect(201);
    expect(closed.body.status).toBe('closed');
    expect(Number(closed.body.expectedCashAmount)).toBe(600);
    expect(Number(closed.body.discrepancyAmount)).toBe(0);
    const alerts = await prisma.alert.findMany({ where: { kind: 'CASH_DISCREPANCY', payload: { path: ['shiftId'], equals: shiftId } } });
    expect(alerts.length).toBe(0);
  });

  test('close beyond threshold → discrepancy alert + audit log', async () => {
    await auth(employeeToken).post('/api/shifts/open').send({ openingCashAmount: 100 }).expect(201);
    await auth(employeeToken).post('/api/orders').send({ status: 'CONFIRMED', notes: `${BC} sale3`, items: [{ productId, quantity: 1 }] }).expect(201);
    const cur = await auth(employeeToken).get('/api/shifts/me/current/expected').expect(200);
    const shiftId = cur.body.shift.id;
    // 200 EGP short (expected 200, counted 0) — well beyond the 20 EGP default
    const closed = await auth(employeeToken).post(`/api/shifts/${shiftId}/close`).send({ closingCashAmount: 0 }).expect(201);
    expect(Number(closed.body.discrepancyAmount)).toBe(-200);
    const alerts = await prisma.alert.findMany({ where: { kind: 'CASH_DISCREPANCY', payload: { path: ['shiftId'], equals: shiftId } } });
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('CRITICAL');
    expect(alerts[0].isRead).toBe(false);
    const audits = await prisma.auditLog.findMany({ where: { entity: 'Shift', entityId: shiftId } });
    expect(audits.length).toBe(1);
    const details = JSON.parse(audits[0].details || '{}');
    expect(details.expected).toBe(200);
    expect(details.actual).toBe(0);
    expect(details.difference).toBe(-200);
    expect(details.cashier).toBeTruthy();
  });

  test('manager sees history with flagged discrepancies; threshold configurable', async () => {
    const list = await auth(ownerToken).get('/api/shifts?status=closed').expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect(list.body[0].employee.user.username).toBeTruthy();
    // owner can update the threshold setting
    const set = await auth(ownerToken).patch('/api/settings').send({ key: 'cash_discrepancy_threshold', value: '250' }).expect(200);
    expect(set.body.value).toBe('250');
    await auth(ownerToken).patch('/api/settings').send({ key: 'cash_discrepancy_threshold', value: '20' }).expect(200);
  });

  test('daily summary build: sales, orders, expenses, net position', async () => {
    const summaryMod = app.get((await import('../src/reports/summary.service')).SummaryService);
    const s = await summaryMod.build(new Date());
    expect(s.totalOrders).toBeGreaterThanOrEqual(2); // sale1 + sale3 confirmed (sale2 cancelled)
    expect(s.totalSales).toBeGreaterThanOrEqual(300);
    expect(s.topItems.length).toBeGreaterThan(0);
    expect(s.netCashPosition).toBe(s.totalSales - s.totalExpenses);
  });
});
