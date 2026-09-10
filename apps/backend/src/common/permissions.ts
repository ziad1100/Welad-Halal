/** Granular permission strings for the WELAD HALAL POS system.
 *  Owner always has ALL permissions (hardcoded, never stored).
 *  Manager/Employee permissions are explicitly assigned by the Owner. */
export const PERMISSIONS = [
  // Users
  'users.view', 'users.create', 'users.edit', 'users.disable', 'users.reset_password', 'users.change_role',
  // Products
  'products.view', 'products.create', 'products.edit', 'products.delete', 'products.change_price',
  // Inventory
  'inventory.view', 'inventory.adjust', 'inventory.stocktake',
  // Purchases
  'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.receive',
  // Sales
  'sales.view', 'sales.create', 'sales.refund', 'sales.cancel',
  // Suppliers
  'suppliers.view', 'suppliers.create', 'suppliers.edit',
  // Customers
  'customers.view', 'customers.create', 'customers.edit',
  // Reports
  'reports.view', 'reports.financial',
  // Settings
  'settings.view', 'settings.edit',
  // Audit
  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Owner always has ALL permissions — this list is never stored, always inferred. */
export const ALL_PERMISSIONS: string[] = [...PERMISSIONS];

/** Permission categories for UI grouping. */
export const PERMISSION_CATEGORIES: { label: string; labelAr: string; permissions: string[] }[] = [
  { label: 'Users', labelAr: 'المستخدمون', permissions: ['users.view', 'users.create', 'users.edit', 'users.disable', 'users.reset_password', 'users.change_role'] },
  { label: 'Products', labelAr: 'الأصناف', permissions: ['products.view', 'products.create', 'products.edit', 'products.delete', 'products.change_price'] },
  { label: 'Inventory', labelAr: 'المخزون', permissions: ['inventory.view', 'inventory.adjust', 'inventory.stocktake'] },
  { label: 'Purchases', labelAr: 'المشتريات', permissions: ['purchases.view', 'purchases.create', 'purchases.edit', 'purchases.receive'] },
  { label: 'Sales', labelAr: 'المبيعات', permissions: ['sales.view', 'sales.create', 'sales.refund', 'sales.cancel'] },
  { label: 'Suppliers', labelAr: 'الموردون', permissions: ['suppliers.view', 'suppliers.create', 'suppliers.edit'] },
  { label: 'Customers', labelAr: 'العملاء', permissions: ['customers.view', 'customers.create', 'customers.edit'] },
  { label: 'Reports', labelAr: 'التقارير', permissions: ['reports.view', 'reports.financial'] },
  { label: 'Settings', labelAr: 'الإعدادات', permissions: ['settings.view', 'settings.edit'] },
  { label: 'Audit', labelAr: 'سجل العمليات', permissions: ['audit.view'] },
];
