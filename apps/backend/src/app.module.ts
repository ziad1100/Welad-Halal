import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ManufacturingModule } from './manufacturing/manufacturing.module';
import { EmployeesModule } from './employees/employees.module';
import { BarcodeModule } from './barcode/barcode.module';
import { HealthController } from './health/health.controller';
import { AuthGuard } from './common/auth.guard';

@Module({
  imports: [
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET || 'dev-secret-change-me-min-32-chars-please', signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN as any) || '8h' } }),
    AuthModule, UsersModule, CategoriesModule, ProductsModule, InventoryModule,
    CustomersModule, OrdersModule, PurchasesModule, ExpensesModule, ReportsModule, AuditModule,
    SuppliersModule, ManufacturingModule, EmployeesModule, BarcodeModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService, Reflector, AuthGuard],
})
export class AppModule {}
