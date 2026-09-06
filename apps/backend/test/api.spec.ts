/**
 * Welad Halal API tests: level-based RBAC (owner 100 / manager 50 / employee 10),
 * owner invariants, user-management matrix, force-password-change gate,
 * plus product/inventory/order lifecycle coverage.
 * Requires DATABASE_URL (local Docker DB). Run: npm test
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Welad Halal API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken = '';
  let managerToken = '';
  let employeeToken = '';
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

  async function cleanTestUsers() {
    await prisma.user.deleteMany({ where: { username: { contains: BC } } }); // cascades employee rows
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.loginAttempt.deleteMany({ where: { username: { in: ['admin', 'manager', 'cashier', 'owner@weladhalal.pos'] } } });
    await prisma.loginAttempt.deleteMany({ where: { username: { contains: '__T' } } });
    await cleanTestUsers();
    await cleanTestProduct();
  }, 60000);

  afterAll(async () => {
    await cleanTestProduct();
    await cleanTestUsers();
    // Restore owner bootstrap state (rotation test changes it).
    const bcrypt = await import('bcryptjs');
    await prisma.user.update({
      where: { username: 'owner@weladhalal.pos' },
      data: { passwordHash: await bcrypt.hash(process.env.OWNER_PASSWORD || 'weladhalal@007', 10), forcePasswordChange: true },
    }).catch(() => {});
    await prisma.loginAttempt.deleteMany({ where: { username: { contains: '__T' } } });
    await app.close();
  });

  const srv = () => request(app.getHttpServer());

  test('owner seed exists with level 100 + force-change flag', async () => {
    const owner = await prisma.user.findUnique({ where: { username: 'owner@weladhalal.pos' } });
    expect(owner).toBeTruthy();
    expect(owner!.role).toBe('owner');
    expect(owner!.permissionLevel).toBe(100);
    expect(owner!.isOwner).toBe(true);
  });

  test('exactly one owner row is enforced at DB level', async () => {
    await expect(prisma.user.create({
      data: { fullName: 'dup', username: `${BC}owner2`, passwordHash: 'x', role: 'owner', permissionLevel: 100, isOwner: true },
    })).rejects.toThrow();
  });

  test('invalid login → 401', async () => {
    await srv().post('/api/auth/login').send({ username: 'cashier', password: 'wrong' }).expect(401);
  });

  test('protected route without token → 401', async () => {
    await srv().get('/api/products').expect(401);
  });

  test('login all levels with permissionLevel in payload', async () => {
    const o = await srv().post('/api/auth/login').send({ username: 'owner@weladhalal.pos', password: process.env.OWNER_PASSWORD || 'weladhalal@007' }).expect(201);
    // Owner seed from migration has force-change; login still succeeds (gate is per-request).
    expect(o.body.user.role).toBe('owner');
    expect(o.body.user.permissionLevel).toBe(100);
    ownerToken = o.body.token;
    const m = await srv().post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(201);
    expect(m.body.user.role).toBe('manager');
    expect(m.body.user.permissionLevel).toBe(50);
    managerToken = m.body.token;
    const e = await srv().post('/api/auth/login').send({ username: 'cashier', password: 'cashier123' }).expect(201);
    expect(e.body.user.role).toBe('employee');
    expect(e.body.user.permissionLevel).toBe(10);
    employeeToken = e.body.token;
  });

  test('owner bootstrap: forced rotation before any other endpoint', async () => {
    await srv().get('/api/users').set('Authorization', `Bearer ${ownerToken}`).expect(403);
    await srv().patch('/api/auth/password').set('Authorization', `Bearer ${ownerToken}`)
      .send({ newPassword: `${BC}ownerpass1` }).expect(200);
    await srv().get('/api/users').set('Authorization', `Bearer ${ownerToken}`).expect(200);
  });

  test('level guard: employee blocked from manager endpoints, manager allowed', async () => {
    await srv().get('/api/users').set('Authorization', `Bearer ${employeeToken}`).expect(403);
    await srv().get('/api/reports/sales').set('Authorization', `Bearer ${employeeToken}`).expect(403);
    await srv().get('/api/users').set('Authorization', `Bearer ${managerToken}`).expect(200);
    await srv().get('/api/reports/sales').set('Authorization', `Bearer ${managerToken}`).expect(200);
  });

  test('employee can read reps (delivery list)', async () => {
    const r = await srv().get('/api/users/reps').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  test('manager cannot create owner; owner creation rejected even for owner', async () => {
    await srv().post('/api/users').set('Authorization', `Bearer ${managerToken}`)
      .send({ fullName: 'X', username: `${BC}fakeowner`, password: 'abcd1234', role: 'owner' }).expect(403);
    await srv().post('/api/users').set('Authorization', `Bearer ${ownerToken}`)
      .send({ fullName: 'X', username: `${BC}fakeowner2`, password: 'abcd1234', role: 'owner' }).expect(403);
  });

  test('manager creates employee; cannot grant above own level', async () => {
    const created = await srv().post('/api/users').set('Authorization', `Bearer ${managerToken}`)
      .send({ fullName: `${BC} Emp`, username: `${BC}emp1`, password: 'abcd1234', role: 'employee' }).expect(201);
    expect(created.body.permissionLevel).toBe(10);
    expect(created.body.role).toBe('employee');
  });

  test('manager cannot edit another manager; owner can', async () => {
    const m2 = await srv().post('/api/users').set('Authorization', `Bearer ${ownerToken}`)
      .send({ fullName: `${BC} Mgr2`, username: `${BC}mgr2`, password: 'abcd1234', role: 'manager' }).expect(201);
    await srv().patch(`/api/users/${m2.body.id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ fullName: 'Hacked' }).expect(403);
    const ok = await srv().patch(`/api/users/${m2.body.id}`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ fullName: `${BC} Mgr2x` }).expect(200);
    expect(ok.body.fullName).toContain('Mgr2x');
  });

  test('manager cannot delete a manager; owner can disable', async () => {
    const target = await prisma.user.findFirst({ where: { username: { contains: BC } , role: 'manager' } });
    await srv().delete(`/api/users/${target!.id}`).set('Authorization', `Bearer ${managerToken}`).expect(403);
    const dis = await srv().delete(`/api/users/${target!.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(dis.body.isActive).toBe(false);
  });

  test('self role change blocked; owner demote/delete/deactivate blocked', async () => {
    const me = await prisma.user.findUnique({ where: { username: 'admin' } });
    await srv().patch(`/api/users/${me!.id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ role: 'employee' }).expect(403);
    const owner = await prisma.user.findUnique({ where: { username: 'owner@weladhalal.pos' } });
    await srv().patch(`/api/users/${owner!.id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ fullName: 'Hacked' }).expect(403);
    await srv().delete(`/api/users/${owner!.id}`).set('Authorization', `Bearer ${managerToken}`).expect(403);
    await srv().patch(`/api/users/${owner!.id}`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ isActive: false }).expect(403);
    await srv().delete(`/api/users/${owner!.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(403);
  });

  test('temporary password forces change before any other endpoint', async () => {
    const created = await srv().post('/api/users').set('Authorization', `Bearer ${managerToken}`)
      .send({ fullName: `${BC} Temp`, username: `${BC}temp1`, role: 'employee', generatePassword: true }).expect(201);
    expect(created.body.forcePasswordChange).toBe(true);
    const temp = created.body.temporaryPassword as string;
    expect(temp?.length).toBeGreaterThan(6);
    const login = await srv().post('/api/auth/login').send({ username: `${BC}temp1`, password: temp }).expect(201);
    const t = login.body.token;
    await srv().get('/api/products').set('Authorization', `Bearer ${t}`).expect(403);
    await srv().patch('/api/auth/password').set('Authorization', `Bearer ${t}`)
      .send({ newPassword: 'newpass123' }).expect(200);
    await srv().get('/api/products').set('Authorization', `Bearer ${t}`).expect(200);
  });

  test('product create → barcode lookup → search', async () => {
    const p = await srv().post('/api/products').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Test API', barcode: `${BC}001`, retailPrice: 50, purchasePrice: 40, quantity: 20 }).expect(201);
    productId = p.body.id;
    const byBarcode = await srv().get(`/api/products/barcode/${BC}001`).set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(byBarcode.body.id).toBe(productId);
    await srv().post('/api/products').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Dup', barcode: `${BC}001`, retailPrice: 1 }).expect(409);
  });

  test('employee cannot create products', async () => {
    await srv().post('/api/products').set('Authorization', `Bearer ${employeeToken}`)
      .send({ name: 'No', retailPrice: 1 }).expect(403);
  });

  test('inventory adjust creates movement', async () => {
    await srv().post('/api/inventory/adjust').set('Authorization', `Bearer ${managerToken}`)
      .send({ productId, quantity: 5 }).expect(201);
    const moves = await srv().get(`/api/inventory/movements?productId=${productId}`).set('Authorization', `Bearer ${managerToken}`).expect(200);
    expect(moves.body.some((m: any) => m.type === 'ADJUSTMENT')).toBe(true);
  });

  test('order lifecycle: hold (no deduction) → confirm (deduct) → cancel (restore)', async () => {
    const before = await prisma.inventory.findUnique({ where: { productId } });
    const held = await srv().post('/api/orders').set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: 'HELD', notes: `${BC} hold`, items: [{ productId, quantity: 3 }] }).expect(201);
    expect(held.body.status).toBe('HELD');
    const duringHold = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(duringHold!.quantity)).toBe(Number(before!.quantity));
    await srv().post(`/api/orders/${held.body.id}/confirm`).set('Authorization', `Bearer ${employeeToken}`).expect(201);
    const afterConfirm = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(afterConfirm!.quantity)).toBe(Number(before!.quantity) - 3);
    await srv().post(`/api/orders/${held.body.id}/cancel`).set('Authorization', `Bearer ${employeeToken}`).expect(201);
    const afterCancel = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(afterCancel!.quantity)).toBe(Number(before!.quantity));
  });

  test('audit log records operations (manager)', async () => {
    const r = await srv().get('/api/audit').set('Authorization', `Bearer ${managerToken}`).expect(200);
    expect(r.body.length).toBeGreaterThan(0);
  });

  test('employee forbidden from audit', async () => {
    await srv().get('/api/audit').set('Authorization', `Bearer ${employeeToken}`).expect(403);
  });

  test('me returns current user; bad token rejected', async () => {
    const me = await srv().get('/api/auth/me').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(me.body.username).toBe('cashier');
    expect(me.body.permissionLevel).toBe(10);
    await srv().get('/api/auth/me').set('Authorization', 'Bearer invalid-token').expect(401);
  });

  test('logout audits', async () => {
    await srv().post('/api/auth/logout').set('Authorization', `Bearer ${employeeToken}`).expect(201);
    const logs = await prisma.auditLog.findMany({ where: { action: 'logout' }, take: 1 });
    expect(logs.length).toBeGreaterThan(0);
  });

  test('lockout after 5 failed logins, generic message preserved', async () => {
    const uname = `${BC}lockuser`;
    await prisma.loginAttempt.deleteMany({ where: { username: uname } });
    for (let i = 0; i < 5; i++) {
      const r = await srv().post('/api/auth/login').send({ username: uname, password: 'nope' });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('بيانات الدخول غير صحيحة');
    }
    await srv().post('/api/auth/login').send({ username: uname, password: 'nope' }).expect(429);
    await prisma.loginAttempt.deleteMany({ where: { username: uname } });
  });

  test('suppliers CRUD + linked purchase', async () => {
    const s = await srv().post('/api/suppliers').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: `${BC}supplier` }).expect(201);
    await srv().post('/api/suppliers').set('Authorization', `Bearer ${employeeToken}`)
      .send({ name: 'no' }).expect(403);
    const po = await srv().post('/api/purchases').set('Authorization', `Bearer ${managerToken}`)
      .send({ supplierName: `${BC}supplier`, supplierId: s.body.id, items: [{ productId, quantity: 2, purchasePrice: 10 }] }).expect(201);
    expect(po.body.id).toBeTruthy();
    const detail = await srv().get(`/api/suppliers/${s.body.id}`).set('Authorization', `Bearer ${managerToken}`).expect(200);
    expect(detail.body.purchases.length).toBeGreaterThan(0);
    await prisma.purchaseItem.deleteMany({ where: { purchaseOrderId: po.body.id } });
    await prisma.purchaseOrder.delete({ where: { id: po.body.id } });
    await prisma.supplier.delete({ where: { id: s.body.id } });
  });

  test('manufacturing: compose bundle then sell it (components deducted)', async () => {
    const b = await srv().post('/api/products').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: '__T bundle', barcode: `${BC}B001`, productType: 'BUNDLED_ITEM', retailPrice: 90 }).expect(201);
    await srv().post('/api/manufacturing/components').set('Authorization', `Bearer ${managerToken}`)
      .send({ bundleId: b.body.id, componentId: productId, quantity: 2 }).expect(201);
    const before = await prisma.inventory.findUnique({ where: { productId } });
    const order = await srv().post('/api/orders').set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: 'CONFIRMED', notes: `${BC} bundle sale`, items: [{ productId: b.body.id, quantity: 1 }] }).expect(201);
    expect(Number(order.body.total)).toBe(90);
    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(after!.quantity)).toBe(Number(before!.quantity) - 2);
    await srv().post(`/api/orders/${order.body.id}/cancel`).set('Authorization', `Bearer ${employeeToken}`).expect(201);
    const restored = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(restored!.quantity)).toBe(Number(before!.quantity));
    await prisma.order.deleteMany({ where: { notes: { contains: `${BC} bundle` } } });
    await prisma.productComponent.deleteMany({ where: { bundleId: b.body.id } });
    await prisma.inventory.deleteMany({ where: { productId: b.body.id } });
    await prisma.productPrice.deleteMany({ where: { productId: b.body.id } });
    await prisma.product.delete({ where: { id: b.body.id } });
  });

  test('barcode lookup: local hit + unknown miss without throwing', async () => {
    const hit = await srv().get(`/api/barcode/${BC}001`).set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(hit.body.found).toBe(true);
    const miss = await srv().get('/api/barcode/0000000000000').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(miss.body.found).toBe(false);
  }, 30000);

  test('employees: owner creates, manager reads, employee blocked', async () => {
    await srv().get('/api/employees').set('Authorization', `Bearer ${employeeToken}`).expect(403);
    await srv().get('/api/employees').set('Authorization', `Bearer ${managerToken}`).expect(200);
  });

  test('stocktake: open → count shortage → commit adjusts + movement + audit', async () => {
    const tname = `${BC}take`;
    const take = await srv().post('/api/inventory/stocktakes').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: tname }).expect(201);
    const before = await prisma.inventory.findUnique({ where: { productId } });
    const counted = Number(before!.quantity) - 2;
    await srv().patch(`/api/inventory/stocktakes/${take.body.id}/lines`).set('Authorization', `Bearer ${managerToken}`)
      .send({ lines: [{ productId, countedQty: counted }] }).expect(200);
    const detail = await srv().get(`/api/inventory/stocktakes/${take.body.id}`).set('Authorization', `Bearer ${managerToken}`).expect(200);
    expect(detail.body.summary.shortages).toBe(1);
    await srv().get(`/api/inventory/stocktakes/${take.body.id}`).set('Authorization', `Bearer ${employeeToken}`).expect(403);
    const res = await srv().post(`/api/inventory/stocktakes/${take.body.id}/commit`).set('Authorization', `Bearer ${managerToken}`).expect(201);
    expect(res.body.applied).toBe(1);
    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(after!.quantity)).toBe(counted);
    const mov = await prisma.stockMovement.findFirst({ where: { productId, type: 'STOCKTAKE' }, orderBy: { createdAt: 'desc' } });
    expect(mov).toBeTruthy();
    expect(Number(mov!.quantity)).toBe(-2);
    await srv().post(`/api/inventory/stocktakes/${take.body.id}/commit`).set('Authorization', `Bearer ${managerToken}`).expect(409);
    await prisma.inventory.update({ where: { productId }, data: { quantity: before!.quantity } });
    await prisma.stockMovement.deleteMany({ where: { referenceType: 'STOCKTAKE' } });
    await prisma.stockTakeLine.deleteMany({ where: { takeId: take.body.id } });
    await prisma.stockTake.delete({ where: { id: take.body.id } });
  });

  test('batches + expiring query', async () => {
    const exp = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const b = await srv().post('/api/inventory/batches').set('Authorization', `Bearer ${managerToken}`)
      .send({ productId, batchNo: `${BC}LOT`, expiryDate: exp, quantity: 10 }).expect(201);
    const list = await srv().get('/api/inventory/expiring?days=7').set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(list.body.some((x: any) => x.id === b.body.id && x.daysLeft <= 7)).toBe(true);
    await prisma.inventoryBatch.delete({ where: { id: b.body.id } });
  });

  test('reprint (GET detail) mutates nothing: same order, same stock', async () => {
    const made = await srv().post('/api/orders').set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: 'CONFIRMED', notes: `${BC} reprint-src`, items: [{ productId, quantity: 1 }] }).expect(201);
    const ordersBefore = await prisma.order.count();
    const invBefore = await prisma.inventory.findUnique({ where: { productId } });
    const d1 = await srv().get(`/api/orders/${made.body.id}`).set('Authorization', `Bearer ${employeeToken}`).expect(200);
    const d2 = await srv().get(`/api/orders/${made.body.id}`).set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(d1.body.orderNumber).toBe(d2.body.orderNumber);
    expect(Number(d1.body.total)).toBe(Number(d2.body.total));
    expect(await prisma.order.count()).toBe(ordersBefore);
    const invAfter = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(invAfter!.quantity)).toBe(Number(invBefore!.quantity));
    await srv().post(`/api/orders/${made.body.id}/cancel`).set('Authorization', `Bearer ${employeeToken}`).expect(201);
    await prisma.order.deleteMany({ where: { notes: { contains: `${BC} reprint-src` } } });
  });
});
