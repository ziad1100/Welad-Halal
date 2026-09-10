import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { PrismaService } from './prisma.service';
import { CacheService } from './common/cache.service';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { getJwtExpiresIn, getJwtSecret } from './common/jwt-secret';
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
import { SettingsModule } from './settings/settings.module';
import { ShiftsModule } from './shifts/shifts.module';
import { AlertsModule } from './alerts/alerts.module';
import { DiscountsModule } from './discounts/discounts.module';
import { PushModule } from './push/push.module';
import { HealthController } from './health/health.controller';
import { AuthGuard } from './common/auth.guard';

@Module({
  imports: [
    // Section 3 — cron scheduler for the daily sales summary job.
    ScheduleModule.forRoot(),
    // Per-IP backstop beside the per-username login lockout in AuthService.
    // Defaults are generous so the existing test-suite traffic never trips them;
    // sensitive routes declare stricter @Throttle() limits individually.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: getJwtExpiresIn() as any } }),
    AuthModule, UsersModule, CategoriesModule, ProductsModule, InventoryModule,
    CustomersModule, OrdersModule, PurchasesModule, ExpensesModule, ReportsModule, AuditModule,
    SuppliersModule, ManufacturingModule, EmployeesModule, BarcodeModule,
    SettingsModule, ShiftsModule, AlertsModule, DiscountsModule, PushModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService, Reflector, AuthGuard, CacheService, { provide: APP_FILTER, useClass: HttpExceptionFilter }, { provide: APP_GUARD, useClass: ThrottlerGuard }],
  exports: [CacheService],
})
export class AppModule {}
