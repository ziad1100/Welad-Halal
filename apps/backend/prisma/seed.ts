import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function main() {
  const adminPass = await bcrypt.hash('admin123', 10);
  const mgrPass = await bcrypt.hash('manager123', 10);
  const cashPass = await bcrypt.hash('cashier123', 10);

  const admin = await prisma.user.upsert({ where: { username: 'admin' }, update: {}, create: { name: 'مدير النظام', username: 'admin', passwordHash: adminPass, role: 'ADMIN' } });
  await prisma.user.upsert({ where: { username: 'manager' }, update: {}, create: { name: 'مدير الفرع', username: 'manager', passwordHash: mgrPass, role: 'MANAGER' } });
  await prisma.user.upsert({ where: { username: 'cashier' }, update: {}, create: { name: 'كاشير', username: 'cashier', passwordHash: cashPass, role: 'CASHIER' } });

  const cats = ['بقالة', 'ألبان', 'مخبوزات', 'مشروبات', 'منظفات', 'لحوم'];
  const catIds: Record<string, string> = {};
  for (const c of cats) {
    const row = await prisma.category.upsert({ where: { name: c }, update: {}, create: { name: c, nameAr: c } });
    catIds[c] = row.id;
  }

  await prisma.customer.upsert({ where: { id: 'cash-customer' }, update: {}, create: { id: 'cash-customer', name: 'عميل نقدي', phone: '0000000000' } }).catch(async () => {
    const ex = await prisma.customer.findFirst({ where: { name: 'عميل نقدي' } });
    if (!ex) await prisma.customer.create({ data: { name: 'عميل نقدي', phone: '0000000000' } });
  });
  await prisma.customer.create({ data: { name: 'أحمد محمد', phone: '01001234567', address: 'القاهرة' } }).catch(() => {});
  await prisma.customer.create({ data: { name: 'شركة النور', phone: '01111234567', address: 'الجيزة' } }).catch(() => {});

  const products: { name: string; barcode: string; cat: string; retail: number; qty: number }[] = [
    { name: 'أرز 5ك', barcode: '100001', cat: 'بقالة', retail: 180, qty: 50 },
    { name: 'سكر 1ك', barcode: '100002', cat: 'بقالة', retail: 35, qty: 100 },
    { name: 'زيت 1.5ل', barcode: '100003', cat: 'بقالة', retail: 95, qty: 40 },
    { name: 'لبن 1ل', barcode: '200001', cat: 'ألبان', retail: 42, qty: 60 },
    { name: 'جبنة بيضاء 500ج', barcode: '200002', cat: 'ألبان', retail: 85, qty: 30 },
    { name: 'عيش بلدي', barcode: '300001', cat: 'مخبوزات', retail: 2, qty: 500 },
    { name: 'مياه 1.5ل', barcode: '400001', cat: 'مشروبات', retail: 8, qty: 200 },
    { name: 'مسحوق غسيل 1ك', barcode: '500001', cat: 'منظفات', retail: 120, qty: 25 },
  ];
  for (const p of products) {
    const ex = await prisma.product.findUnique({ where: { barcode: p.barcode } });
    if (ex) continue;
    const prod = await prisma.product.create({
      data: { name: p.name, nameAr: p.name, barcode: p.barcode, sku: p.barcode, categoryId: catIds[p.cat], retailPrice: new Decimal(p.retail), purchasePrice: new Decimal(Math.round(p.retail * 0.8)), unit: 'قطعة' },
    });
    await prisma.productPrice.create({ data: { productId: prod.id, price: new Decimal(p.retail) } });
    await prisma.inventory.create({ data: { productId: prod.id, quantity: new Decimal(p.qty), minimumQuantity: new Decimal(5) } });
    await prisma.stockMovement.create({ data: { productId: prod.id, type: 'OPENING_BALANCE', quantity: new Decimal(p.qty), createdById: admin.id } });
  }
  // Demo supplier + composite (bundled) product: "عرض البقالة" = أرز + سكر
  const supplier = await prisma.supplier.upsert({ where: { id: 'demo-supplier' }, update: {}, create: { id: 'demo-supplier', name: 'شركة التوريد المتحدة', phone: '01221234567', address: 'القاهرة' } }).catch(async () => {
    const ex = await prisma.supplier.findFirst({ where: { name: 'شركة التوريد المتحدة' } });
    if (ex) return ex;
    return prisma.supplier.create({ data: { name: 'شركة التوريد المتحدة', phone: '01221234567' } });
  });
  const rice = await prisma.product.findUnique({ where: { barcode: '100001' } });
  const sugar = await prisma.product.findUnique({ where: { barcode: '100002' } });
  let bundle = await prisma.product.findUnique({ where: { barcode: '900001' } });
  if (!bundle) {
    bundle = await prisma.product.create({ data: { name: 'عرض البقالة (أرز + سكر)', nameAr: 'عرض البقالة (أرز + سكر)', barcode: '900001', sku: '900001', categoryId: catIds['بقالة'], productType: 'BUNDLED_ITEM', retailPrice: new Decimal(200), purchasePrice: new Decimal(170), supplierId: supplier.id, priceTiers: [{ tier: 'قطاعي', price: 200 }, { tier: 'جملة', price: 190 }] } });
    await prisma.productPrice.create({ data: { productId: bundle.id, price: new Decimal(200) } });
    await prisma.inventory.create({ data: { productId: bundle.id, quantity: new Decimal(0), minimumQuantity: new Decimal(0) } });
  }
  if (rice && sugar && bundle) {
    await prisma.productComponent.upsert({ where: { bundleId_componentId: { bundleId: bundle.id, componentId: rice.id } }, update: { quantity: new Decimal(1) }, create: { bundleId: bundle.id, componentId: rice.id, quantity: new Decimal(1) } });
    await prisma.productComponent.upsert({ where: { bundleId_componentId: { bundleId: bundle.id, componentId: sugar.id } }, update: { quantity: new Decimal(1) }, create: { bundleId: bundle.id, componentId: sugar.id, quantity: new Decimal(1) } });
  }
  console.log('Seed done: admin/admin123, manager/manager123, cashier/cashier123');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
