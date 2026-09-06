/**
 * API lifecycle tests (§71): auth, RBAC, products/barcode, inventory,
 * order hold → confirm → cancel with stock verification.
 * Requires DATABASE_URL (local Docker DB). Run: npm test
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('KStore API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken = '';
  let cashierToken = '';
  let productId = '';
  const BC = `__T${Date.now().toString(36)}_`; // unique per run — reruns never collide with leftovers

  async function cleanTestProduct() {
    const ids = (await prisma.product.findMany({ where: { OR: [{ barcode: `${BC}001` }, { barcode: `${BC}B001` }] }, select: { id: true } })).map((p) => p.id);
    if (ids.length) {
      await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
      await prisma.order.deleteMany({ where: { notes: { contains: BC } } });
      await prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventory.deleteMany({ where: { productId: { in: ids } } });
      await prisma.productPrice.deleteMany({ where: { productId: { in: ids } } });
      await prisma.productComponent.deleteMany({ where: { OR: [{ bundleId: { in: ids } }, { componentId: { in: ids } }] } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    } else {
      await prisma.order.deleteMany({ where: { notes: { contains: BC } } });
    }
    // supplier leftovers (name-keyed) + their purchases
    const supIds = (await prisma.supplier.findMany({ where: { name: { contains: BC } }, select: { id: true } })).map((s) => s.id);
    if (supIds.length) {
      const poIds = (await prisma.purchaseOrder.findMany({ where: { supplierId: { in: supIds } }, select: { id: true } })).map((p) => p.id);
      if (poIds.length) {
        await prisma.purchaseItem.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
        await prisma.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
      }
      await prisma.supplier.deleteMany({ where: { id: { in: supIds } } });
    }
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    // Lockout state persists across runs — clear attempts for seed users + leftovers.
    await prisma.loginAttempt.deleteMany({ where: { username: { in: ['admin', 'manager', 'cashier'] } } });
    await prisma.loginAttempt.deleteMany({ where: { username: { contains: '__T' } } });
    await cleanTestProduct();
  }, 60000);

  afterAll(async () => {
    await cleanTestProduct();
    await prisma.loginAttempt.deleteMany({ where: { username: { contains: '__T' } } });
    await app.close();
  });

  test('invalid login → 401', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'cashier', password: 'wrong' }).expect(401);
  });

  test('protected route without token → 401', async () => {
    await request(app.getHttpServer()).get('/api/products').expect(401);
  });

  test('login all roles', async () => {
    const a = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(201);
    adminToken = a.body.token;
    const c = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'cashier', password: 'cashier123' }).expect(201);
    cashierToken = c.body.token;
    expect(a.body.user.role).toBe('ADMIN');
  });

  test('cashier forbidden from admin APIs', async () => {
    await request(app.getHttpServer()).get('/api/users').set('Authorization', `Bearer ${cashierToken}`).expect(403);
    await request(app.getHttpServer()).get('/api/reports/sales').set('Authorization', `Bearer ${cashierToken}`).expect(403);
  });

  test('cashier can read reps (delivery list)', async () => {
    const r = await request(app.getHttpServer()).get('/api/users/reps').set('Authorization', `Bearer ${cashierToken}`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  test('product create → barcode lookup → search', async () => {
    const p = await request(app.getHttpServer()).post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test API', barcode: `${BC}001`, retailPrice: 50, purchasePrice: 40, quantity: 20 }).expect(201);
    productId = p.body.id;
    const byBarcode = await request(app.getHttpServer()).get(`/api/products/barcode/${BC}001`).set('Authorization', `Bearer ${cashierToken}`).expect(200);
    expect(byBarcode.body.id).toBe(productId);
    await request(app.getHttpServer()).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dup', barcode: `${BC}001`, retailPrice: 1 }).expect(409);
  });

  test('cashier cannot create products', async () => {
    await request(app.getHttpServer()).post('/api/products').set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'No', retailPrice: 1 }).expect(403);
  });

  test('inventory adjust creates movement', async () => {
    await request(app.getHttpServer()).post('/api/inventory/adjust').set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, quantity: 5 }).expect(201);
    const moves = await request(app.getHttpServer()).get(`/api/inventory/movements?productId=${productId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(moves.body.some((m: any) => m.type === 'ADJUSTMENT')).toBe(true);
  });

  test('order lifecycle: hold (no deduction) → confirm (deduct) → cancel (restore)', async () => {
    const before = await prisma.inventory.findUnique({ where: { productId } });
    const held = await request(app.getHttpServer()).post('/api/orders').set('Authorization', `Bearer ${cashierToken}`)
      .send({ status: 'HELD', notes: `${BC} hold`, items: [{ productId, quantity: 3 }] }).expect(201);
    expect(held.body.status).toBe('HELD');
    const duringHold = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(duringHold!.quantity)).toBe(Number(before!.quantity)); // no deduction on hold
    await request(app.getHttpServer()).post(`/api/orders/${held.body.id}/confirm`).set('Authorization', `Bearer ${cashierToken}`).expect(201);
    const afterConfirm = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(afterConfirm!.quantity)).toBe(Number(before!.quantity) - 3);
    await request(app.getHttpServer()).post(`/api/orders/${held.body.id}/cancel`).set('Authorization', `Bearer ${cashierToken}`).expect(201);
    const afterCancel = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(afterCancel!.quantity)).toBe(Number(before!.quantity)); // restored
  });

  test('audit log records operations (admin)', async () => {
    const r = await request(app.getHttpServer()).get('/api/audit').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(r.body.length).toBeGreaterThan(0);
  });

  test('cashier forbidden from audit', async () => {
    await request(app.getHttpServer()).get('/api/audit').set('Authorization', `Bearer ${cashierToken}`).expect(403);
  });

  test('me returns current user; bad token rejected', async () => {
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${cashierToken}`).expect(200);
    expect(me.body.username).toBe('cashier');
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer invalid-token').expect(401);
  });

  test('logout audits and client session ends', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').set('Authorization', `Bearer ${cashierToken}`).expect(201);
    const logs = await prisma.auditLog.findMany({ where: { action: 'logout' }, take: 1 });
    expect(logs.length).toBeGreaterThan(0);
  });

  test('lockout after 5 failed logins, generic message preserved', async () => {
    const uname = `${BC}lockuser`;
    await prisma.loginAttempt.deleteMany({ where: { username: uname } });
    for (let i = 0; i < 5; i++) {
      const r = await request(app.getHttpServer()).post('/api/auth/login').send({ username: uname, password: 'nope' });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('بيانات الدخول غير صحيحة'); // no user enumeration
    }
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: uname, password: 'nope' }).expect(429);
    await prisma.loginAttempt.deleteMany({ where: { username: uname } });
  });

  test('suppliers CRUD + linked purchase', async () => {
    const s = await request(app.getHttpServer()).post('/api/suppliers').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `${BC}supplier` }).expect(201);
    await request(app.getHttpServer()).post('/api/suppliers').set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'no' }).expect(403);
    const po = await request(app.getHttpServer()).post('/api/purchases').set('Authorization', `Bearer ${adminToken}`)
      .send({ supplierName: `${BC}supplier`, supplierId: s.body.id, items: [{ productId, quantity: 2, purchasePrice: 10 }] }).expect(201);
    expect(po.body.id).toBeTruthy();
    const detail = await request(app.getHttpServer()).get(`/api/suppliers/${s.body.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(detail.body.purchases.length).toBeGreaterThan(0);
    await prisma.purchaseItem.deleteMany({ where: { purchaseOrderId: po.body.id } });
    await prisma.purchaseOrder.delete({ where: { id: po.body.id } });
    await prisma.supplier.delete({ where: { id: s.body.id } });
  });

  test('manufacturing: compose bundle then sell it (components deducted)', async () => {
    // bundle product with the test product as component
    const b = await request(app.getHttpServer()).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '__T bundle', barcode: `${BC}B001`, productType: 'BUNDLED_ITEM', retailPrice: 90 }).expect(201);
    await request(app.getHttpServer()).post('/api/manufacturing/components').set('Authorization', `Bearer ${adminToken}`)
      .send({ bundleId: b.body.id, componentId: productId, quantity: 2 }).expect(201);
    const before = await prisma.inventory.findUnique({ where: { productId } });
    const order = await request(app.getHttpServer()).post('/api/orders').set('Authorization', `Bearer ${cashierToken}`)
      .send({ status: 'CONFIRMED', notes: `${BC} bundle sale`, items: [{ productId: b.body.id, quantity: 1 }] }).expect(201);
    expect(Number(order.body.total)).toBe(90);
    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(after!.quantity)).toBe(Number(before!.quantity) - 2); // decomposed
    await request(app.getHttpServer()).post(`/api/orders/${order.body.id}/cancel`).set('Authorization', `Bearer ${cashierToken}`).expect(201);
    const restored = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(restored!.quantity)).toBe(Number(before!.quantity));
    await prisma.order.deleteMany({ where: { notes: { contains: `${BC} bundle` } } });
    await prisma.productComponent.deleteMany({ where: { bundleId: b.body.id } });
    await prisma.inventory.deleteMany({ where: { productId: b.body.id } });
    await prisma.productPrice.deleteMany({ where: { productId: b.body.id } });
    await prisma.product.delete({ where: { id: b.body.id } });
  });

  test('barcode lookup: local hit + unknown miss without throwing', async () => {
    const hit = await request(app.getHttpServer()).get(`/api/barcode/${BC}001`).set('Authorization', `Bearer ${cashierToken}`).expect(200);
    expect(hit.body.found).toBe(true);
    const miss = await request(app.getHttpServer()).get('/api/barcode/0000000000000').set('Authorization', `Bearer ${cashierToken}`).expect(200);
    expect(miss.body.found).toBe(false);
  }, 30000);

  test('employees: admin creates, manager reads, cashier blocked', async () => {
    await request(app.getHttpServer()).get('/api/employees').set('Authorization', `Bearer ${cashierToken}`).expect(403);
    const mgr = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'manager', password: 'manager123' }).expect(201);
    await request(app.getHttpServer()).get('/api/employees').set('Authorization', `Bearer ${mgr.body.token}`).expect(200);
  });

  test('stocktake: open → count shortage → commit adjusts + movement + audit', async () => {
    const tname = `${BC}take`;
    const take = await request(app.getHttpServer()).post('/api/inventory/stocktakes').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: tname }).expect(201);
    const before = await prisma.inventory.findUnique({ where: { productId } });
    const counted = Number(before!.quantity) - 2;
    await request(app.getHttpServer()).patch(`/api/inventory/stocktakes/${take.body.id}/lines`).set('Authorization', `Bearer ${adminToken}`)
      .send({ lines: [{ productId, countedQty: counted }] }).expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/inventory/stocktakes/${take.body.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(detail.body.summary.shortages).toBe(1);
    // double-commit protection + cashier RBAC
    await request(app.getHttpServer()).get(`/api/inventory/stocktakes/${take.body.id}`).set('Authorization', `Bearer ${cashierToken}`).expect(403);
    const res = await request(app.getHttpServer()).post(`/api/inventory/stocktakes/${take.body.id}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    expect(res.body.applied).toBe(1);
    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(after!.quantity)).toBe(counted);
    const mov = await prisma.stockMovement.findFirst({ where: { productId, type: 'STOCKTAKE' }, orderBy: { createdAt: 'desc' } });
    expect(mov).toBeTruthy();
    expect(Number(mov!.quantity)).toBe(-2);
    await request(app.getHttpServer()).post(`/api/inventory/stocktakes/${take.body.id}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(409);
    // restore + cleanup
    await prisma.inventory.update({ where: { productId }, data: { quantity: before!.quantity } });
    await prisma.stockMovement.deleteMany({ where: { referenceType: 'STOCKTAKE' } });
    await prisma.stockTakeLine.deleteMany({ where: { takeId: take.body.id } });
    await prisma.stockTake.delete({ where: { id: take.body.id } });
  });

  test('batches + expiring query', async () => {
    const exp = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const b = await request(app.getHttpServer()).post('/api/inventory/batches').set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, batchNo: `${BC}LOT`, expiryDate: exp, quantity: 10 }).expect(201);
    const list = await request(app.getHttpServer()).get('/api/inventory/expiring?days=7').set('Authorization', `Bearer ${cashierToken}`).expect(200);
    expect(list.body.some((x: any) => x.id === b.body.id && x.daysLeft <= 7)).toBe(true);
    await prisma.inventoryBatch.delete({ where: { id: b.body.id } });
  });
});
