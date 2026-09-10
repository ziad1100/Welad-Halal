/**
 * Critical transaction + price-security tests (spec §72–73).
 * Requires DATABASE_URL. Run: npm run test:critical
 */
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

describe('critical order transaction', () => {
  let productId: string;
  let userId: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash('test123', 10);
    const user = await prisma.user.upsert({ where: { username: '__test_cashier' }, update: {}, create: { fullName: 'Test', username: '__test_cashier', passwordHash: hash, role: 'employee', permissionLevel: 10 } });
    userId = user.id;
    let p = await prisma.product.findUnique({ where: { barcode: '__TEST_001' } });
    if (!p) {
      p = await prisma.product.create({ data: { name: 'Test Product', barcode: '__TEST_001', retailPrice: new Decimal(100), purchasePrice: new Decimal(80) } });
      await prisma.inventory.create({ data: { productId: p.id, quantity: new Decimal(10) } });
    } else {
      await prisma.inventory.upsert({ where: { productId: p.id }, create: { productId: p.id, quantity: new Decimal(10) }, update: { quantity: new Decimal(10) } });
      await prisma.product.update({ where: { id: p.id }, data: { retailPrice: new Decimal(100) } });
    }
    productId = p.id;
    await prisma.orderItem.deleteMany({ where: { productId } });
    await prisma.order.deleteMany({ where: { notes: { contains: '__TEST' } } });
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { notes: { contains: '__TEST' } } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.inventory.deleteMany({ where: { productId } });
    await prisma.productPrice.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { username: '__test_cashier' } });
    await prisma.$disconnect();
  });

  test('price manipulation is ignored; stock deducted; snapshot preserved', async () => {
    const { OrdersService } = await import('../src/orders/orders.service');
    // Constructor needs discount/settings/alerts services — discount codes are
    // exercised end-to-end in api.spec.ts; here we pass stubs (never hit for
    // plain orders).
    const svc = new OrdersService(
      prisma as any,
      { validateForConfirm: async () => ({ row: {}, amount: 0 }), consume: async () => ({}) } as any,
      { assertExternalOrdersAllowed: async () => {} } as any,
      { pendingReturnApproval: async () => ({}) } as any,
    );

    // Attacker sends unitPrice=1, real price=100 → must charge 100
    const order: any = await svc.create({ items: [{ productId, quantity: 2, unitPrice: 1 }], notes: '__TEST order1' } as any, userId);
    expect(Number(order.total)).toBe(200);
    expect(Number(order.items[0].unitPriceSnapshot)).toBe(100);

    const inv = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(inv!.quantity)).toBe(8);
    const mov = await prisma.stockMovement.findFirst({ where: { productId, referenceId: order.id } });
    expect(mov).toBeTruthy();
    expect(Number(mov!.quantity)).toBe(2);

    // Change price to 120 → old order stays 100, new order charges 120
    await prisma.product.update({ where: { id: productId }, data: { retailPrice: new Decimal(120) } });
    const order2: any = await svc.create({ items: [{ productId, quantity: 1 }], notes: '__TEST order2' } as any, userId);
    expect(Number(order2.total)).toBe(120);
    const order1Again = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });
    expect(Number(order1Again!.items[0].unitPriceSnapshot)).toBe(100);

    // Insufficient stock → rollback, no partial order
    await expect(svc.create({ items: [{ productId, quantity: 9999 }], notes: '__TEST fail' } as any, userId)).rejects.toThrow('الكمية غير متاحة في المخزن');
    const count = await prisma.order.count({ where: { notes: '__TEST fail' } });
    expect(count).toBe(0);
  });

  test('idempotency key: replay returns the same order, no duplicate stock deduction', async () => {
    const { OrdersService } = await import('../src/orders/orders.service');
    const svc = new OrdersService(
      prisma as any,
      { validateForConfirm: async () => ({ row: {}, amount: 0 }), consume: async () => ({}) } as any,
      { assertExternalOrdersAllowed: async () => {} } as any,
      { pendingReturnApproval: async () => ({}) } as any,
    );
    const key = `__TEST-key-${Date.now()}`;
    const req = { headers: { 'idempotency-key': key } };
    const before = await prisma.inventory.findUnique({ where: { productId } });
    const first: any = await svc.create({ items: [{ productId, quantity: 1 }], notes: '__TEST idem' } as any, userId, req);
    const second: any = await svc.create({ items: [{ productId, quantity: 1 }], notes: '__TEST idem' } as any, userId, req);
    expect(second.id).toBe(first.id);
    expect(await prisma.order.count({ where: { notes: '__TEST idem' } })).toBe(1);
    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(Number(after!.quantity)).toBe(Number(before!.quantity) - 1);
    // Failed attempt releases the claim: same key works afterwards.
    const badKey = `__TEST-key-bad-${Date.now()}`;
    const badReq = { headers: { 'idempotency-key': badKey } };
    await expect(svc.create({ items: [{ productId: 'no-such-product', quantity: 1 }], notes: '__TEST idem-fail' } as any, userId, badReq)).rejects.toThrow();
    const retry: any = await svc.create({ items: [{ productId, quantity: 1 }], notes: '__TEST idem' } as any, userId, badReq);
    expect(retry.id).toBeTruthy();
    await prisma.order.deleteMany({ where: { notes: { contains: '__TEST idem' } } });
    await prisma.idempotencyKey.deleteMany({ where: { key: { contains: '__TEST-key' } } });
  });
});
