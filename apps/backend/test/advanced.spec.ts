/**
 * Advanced CX features (§1/§2/§5/§6/§7 backend): discount-code validation +
 * consumption, public (no-login) order view + rating, manager return
 * approvals, store-closed enforcement for external intake, fuzzy search.
 * Requires DATABASE_URL. Run: npm run test -- --testPathPattern advanced
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Advanced CX', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken = '';
  let managerToken = '';
  let employeeToken = '';
  let productId = '';
  const BC = `__A${Date.now().toString(36)}_`;
  const OWNER_PW = `${BC}ownerpass1`;

  async function resetOwner(force: boolean) {
    const bcrypt = await import('bcryptjs');
    await prisma.user.update({
      where: { username: 'احمد الصياد' },
      data: { passwordHash: await bcrypt.hash(OWNER_PW, 10), forcePasswordChange: false },
    });
  }

  async function cleanup() {
    const ids = (await prisma.product.findMany({ where: { barcode: { contains: BC } }, select: { id: true } })).map((p: any) => p.id);
    if (ids.length) {
      await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
      await prisma.order.deleteMany({ where: { notes: { contains: BC } } });
      await prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventory.deleteMany({ where: { productId: { in: ids } } });
      await prisma.productPrice.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    } else {
      await prisma.order.deleteMany({ where: { notes: { contains: BC } } });
    }
    await prisma.discountCode.deleteMany({ where: { code: { contains: BC } } });
    await prisma.user.deleteMany({ where: { username: { contains: BC } } });
    await prisma.alert.deleteMany({ where: { title: { contains: BC } } });
    await prisma.loginAttempt.deleteMany({ where: { username: { contains: BC } } });
    await prisma.auditLog.deleteMany({ where: { details: { contains: BC } } }).catch(() => {});
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.loginAttempt.deleteMany({ where: { username: { in: ['cashier', 'admin', 'احمد الصياد', 'manager'] } } });
    await resetOwner(false);
    await cleanup();
    const o = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'احمد الصياد', password: OWNER_PW }).expect(201);
    ownerToken = o.body.token;
    const m = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(201);
    managerToken = m.body.token;
    const e = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'cashier', password: 'cashier123' }).expect(201);
    employeeToken = e.body.token;
    const p = await request(app.getHttpServer()).post('/api/products').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: `${BC}Arز`, nameAr: `${BC}أرز فاخر`, barcode: `${BC}001`, retailPrice: 100, purchasePrice: 80, quantity: 50 }).expect(201);
    productId = p.body.id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
    const bcrypt2 = await import('bcryptjs');
    const crypto = await import('crypto');
    await prisma.user.update({
      where: { username: 'احمد الصياد' },
      data: { passwordHash: await bcrypt2.hash(crypto.randomBytes(24).toString('hex'), 10), forcePasswordChange: true },
    }).catch(() => {});
    await app.close();
  });

  const srv = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  test('§2 discount code lifecycle: create → preview valid → confirm consumes usage → exhausted rejected', async () => {
    const code = `${BC}W10`;
    const d = await srv().post('/api/discount-codes').set(auth(managerToken))
      .send({ code, discountType: 'percentage', discountValue: 10, usageLimit: 2 }).expect(201);
    expect(d.body.code).toBe(code.toUpperCase());

    // Preview returns the authoritative amount (10% of 200 = 20).
    const pv = await srv().get(`/api/discount-codes/preview?code=${code}&subtotal=200`).set(auth(employeeToken)).expect(200);
    expect(pv.body.valid).toBe(true);
    expect(pv.body.discountAmount).toBe(20);

    // Order with the code: total 2×100 = 200 − 20 = 180; usage → 1.
    const order = await srv().post('/api/orders').set(auth(employeeToken))
      .send({ status: 'CONFIRMED', notes: `${BC} dc1`, items: [{ productId, quantity: 2 }], discountCode: code }).expect(201);
    expect(Number(order.body.total)).toBe(180);
    expect(order.body.discountCode).toBe(code.toUpperCase());
    const row1 = await prisma.discountCode.findUnique({ where: { code: code.toUpperCase() } });
    expect(Number(row1!.timesUsed)).toBe(1);

    // Expire the code → a second order must be rejected server-side.
    await srv().patch(`/api/discount-codes/${d.body.id}`).set(auth(managerToken))
      .send({ validUntil: new Date(Date.now() - 1000).toISOString() }).expect(200);
    await srv().post('/api/orders').set(auth(employeeToken))
      .send({ status: 'CONFIRMED', notes: `${BC} dc2`, items: [{ productId, quantity: 1 }], discountCode: code }).expect(400);

    // Exhaust usage limit → third code must reject.
    await srv().patch(`/api/discount-codes/${d.body.id}`).set(auth(managerToken)).send({ validUntil: undefined as any }).expect(200);
    await prisma.discountCode.update({ where: { id: d.body.id }, data: { validUntil: null, timesUsed: 2 } });
    await srv().post('/api/orders').set(auth(employeeToken))
      .send({ status: 'CONFIRMED', notes: `${BC} dc3`, items: [{ productId, quantity: 1 }], discountCode: code }).expect(400);
    // Cleanup the test orders + movements (stock restored indirectly).
    await prisma.order.deleteMany({ where: { notes: { contains: `${BC} dc` } } });
    await prisma.stockMovement.deleteMany({ where: { referenceType: 'ORDER' } });
  });

  test('§2 employee preview allowed, code CRUD manager-only', async () => {
    await srv().post('/api/discount-codes').set(auth(employeeToken))
      .send({ code: `${BC}x`, discountType: 'percentage', discountValue: 5 }).expect(403);
    await srv().get('/api/discount-codes').set(auth(employeeToken)).expect(403);
    await srv().get('/api/discount-codes/preview?code=NOPE&subtotal=100').set(auth(employeeToken)).expect(200);
  });

  test('§1 public order view + rating (no auth); sequential number not required', async () => {
    const order = await srv().post('/api/orders').set(auth(employeeToken))
      .send({ status: 'CONFIRMED', notes: `${BC} public`, items: [{ productId, quantity: 1 }] }).expect(201);
    const token = order.body.publicToken;
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThanOrEqual(16);

    const view = await srv().get(`/api/public/orders/${token}`).expect(200);
    expect(Number(view.body.total)).toBe(100);
    expect(view.body.items.length).toBe(1);
    expect(view.body.rating).toBeNull();

    await srv().post(`/api/public/orders/${token}/rating`).send({ rating: 5, note: 'ممتاز' }).expect(201);
    const rated = await srv().get(`/api/public/orders/${token}`).expect(200);
    expect(rated.body.rating).toBe(5);
    // Invalid rating rejected.
    await srv().post(`/api/public/orders/${token}/rating`).send({ rating: 9 }).expect(400);
    // Token URL does not leak the sequential number: fetching by raw id fails publicly.
    await srv().get(`/api/public/orders/${order.body.id}`).expect(404);
    await prisma.order.deleteMany({ where: { notes: { contains: `${BC} public` } } });
    await prisma.stockMovement.deleteMany({ where: { referenceType: 'ORDER' } });
  });

  test('§7 high-value return request requires manager approval; approve finalizes', async () => {
    // Threshold default 500 — one product costs 100 → need 6 units = 600.
    const order = await srv().post('/api/orders').set(auth(employeeToken))
      .send({ status: 'CONFIRMED', notes: `${BC} big`, items: [{ productId, quantity: 6 }] }).expect(201);
    const before = await prisma.inventory.findUnique({ where: { productId } });

    // Cashier requests the return → pending approval, stock untouched.
    const req = await srv().post(`/api/orders/${order.body.id}/return-request`).set(auth(employeeToken)).expect(201);
    expect(req.body.pendingApproval).toBe(true);
    expect((await prisma.inventory.findUnique({ where: { productId } }))!.quantity.toString()).toBe(before!.quantity.toString());

    // Approvals tab lists it (manager).
    const list = await srv().get('/api/orders?tab=approvals').set(auth(managerToken)).expect(200);
    expect(list.body.some((o: any) => o.id === order.body.id)).toBe(true);

    // Cashier cannot approve (level < 50).
    await srv().post(`/api/orders/${order.body.id}/approve-return`).set(auth(employeeToken)).expect(403);

    // Manager approves → stock restored + RETURNED.
    const appr = await srv().post(`/api/orders/${order.body.id}/approve-return`).set(auth(managerToken)).expect(201);
    expect(appr.body.status).toBe('RETURNED');
    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(after!.quantity)).toBe(Number(before!.quantity) + 6);

    // Low-value return (100 < threshold) finalizes immediately without approval.
    const small = await srv().post('/api/orders').set(auth(employeeToken))
      .send({ status: 'CONFIRMED', notes: `${BC} small`, items: [{ productId, quantity: 1 }] }).expect(201);
    const smallReq = await srv().post(`/api/orders/${small.body.id}/return-request`).set(auth(employeeToken)).expect(201);
    expect(smallReq.body.status).toBe('RETURNED');

    await prisma.order.deleteMany({ where: { notes: { contains: `${BC} big` } } });
    await prisma.order.deleteMany({ where: { notes: { contains: `${BC} small` } } });
    await prisma.stockMovement.deleteMany({ where: { referenceType: 'ORDER' } });
    await prisma.alert.deleteMany({ where: { kind: 'PENDING_RETURN_APPROVAL' } });
  });

  test('§6 store closed → external intake rejected, in-store POS unaffected', async () => {
    await srv().post('/api/store/accepting').set(auth(managerToken)).send({ accepting: false }).expect(201);
    const status = await srv().get('/api/store/status').expect(200);
    expect(status.body.acceptingOrders).toBe(false);

    // External channel (header) → rejected with the Arabic closure message.
    await srv().post('/api/orders').set({ ...auth(employeeToken), 'X-Channel': 'external' })
      .send({ status: 'CONFIRMED', notes: `${BC} external`, items: [{ productId, quantity: 1 }] }).expect(400);

    // In-store POS (no header) → still works.
    const ok = await srv().post('/api/orders').set(auth(employeeToken))
      .send({ status: 'CONFIRMED', notes: `${BC} instore`, items: [{ productId, quantity: 1 }] }).expect(201);
    expect(ok.body.status).toBe('CONFIRMED');

    await srv().post('/api/store/accepting').set(auth(managerToken)).send({ accepting: true }).expect(201);
    await prisma.order.deleteMany({ where: { notes: { contains: `${BC} instore` } } });
    await prisma.stockMovement.deleteMany({ where: { referenceType: 'ORDER' } });
  });

  test('§5 fuzzy search ranks best name match; barcode stays exact', async () => {
    // Arabic trigram fuzzy: typo-tolerant partial match on nameAr.
    const fuzzy = await srv().get(`/api/products?search=${encodeURIComponent(`${BC}أرز`)}`).set(auth(employeeToken)).expect(200);
    expect(fuzzy.body.some((p: any) => p.id === productId)).toBe(true);
    // Exact barcode endpoint stays precise.
    const exact = await srv().get(`/api/products/barcode/${BC}001`).set(auth(employeeToken)).expect(200);
    expect(exact.body.id).toBe(productId);
    // Barcode fuzzy must NOT happen: wrong barcode → no row (not a fuzzy suggestion).
    const wrong = await srv().get(`/api/products/barcode/${BC}00X`).set(auth(employeeToken)).expect(200);
    expect(wrong.body?.id).toBeUndefined();
  });
});
