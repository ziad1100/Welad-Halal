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
  const BC = '__T_API_';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { notes: { contains: BC } } });
    await prisma.stockMovement.deleteMany({ where: { product: { barcode: `${BC}001` } } });
    await prisma.inventory.deleteMany({ where: { product: { barcode: `${BC}001` } } });
    await prisma.productPrice.deleteMany({ where: { product: { barcode: `${BC}001` } } });
    await prisma.product.deleteMany({ where: { barcode: `${BC}001` } });
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
});
