import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLang } from '../store/lang';

/**
 * §8 — Secondary language support for UI chrome ONLY (menus, buttons, labels,
 * column headers). Product/category/customer data stays as-entered, and the
 * printed receipt template is permanently Arabic (never translated).
 */
const ar = {
  brand: 'Welad Halal — نظام إدارة الطلبات',
  version: 'نسخة محدثة',
  user: 'المستخدم',
  date: 'التاريخ',
  time: 'الوقت',
  // menus
  file: 'ملف', sales: 'المبيعات', purchases: 'المشتريات', suppliers: 'الموردون والعملاء',
  manufacturing: 'تصنيع', warehouse: 'المخزن', workReports: 'تقارير العمل', staff: 'شؤون الموظفين',
  tools: 'أدوات', admin: 'الإدارة', help: 'مساعدة',
  // toolbar
  refresh: 'تحديث', print: 'طباعة', users: 'المستخدمون', calendar: 'تقويم', lock: 'قفل',
  logout: 'خروج', alerts: 'التنبيهات', open: 'مفتوح', closed: 'مغلق مؤقتًا', store: 'المحل',
  theme: 'المظهر', language: 'اللغة',
  // tabs
  ordersLog: 'سجل الطلبات', newOrder: 'طلب جديد (POS)', products: 'الأصناف', categories: 'التصنيفات',
  inventory: 'المخزون', stocktake: 'الجرد', suppliersTab: 'الموردون', manufacturingTab: 'التصنيع',
  hr: 'العاملون', expenses: 'المصروفات', reports: 'التقارير', audit: 'السجل', printer: 'الطابعة',
  usersTab: 'المستخدمون', shifts: 'الشيفتات', settingsTab: 'الإعدادات', discounts: 'أكواد الخصم',
  approvals: 'الموافقات', customerDisplay: 'شاشة العرض', mobile: 'التطبيق',
  // common actions
  save: 'حفظ', cancel: 'إلغاء', close: 'إغلاق', add: 'إضافة', search: 'بحث', back: 'رجوع',
  // POS bottom actions
  returns: 'مرتجع', expensesShort: 'مصروفات', openDrawer: 'فتح الدرج', printCopy: 'طباعة نسخة',
  preview: 'معاينة الفاتورة', hold: 'تعليق الفاتورة (F9)', confirm: 'تأكيد (F12)',
};

const en: typeof ar = {
  brand: 'Welad Halal — Order Management',
  version: 'updated',
  user: 'User', date: 'Date', time: 'Time',
  file: 'File', sales: 'Sales', purchases: 'Purchases', suppliers: 'Suppliers & Customers',
  manufacturing: 'Manufacturing', warehouse: 'Warehouse', workReports: 'Work Reports', staff: 'Staff',
  tools: 'Tools', admin: 'Administration', help: 'Help',
  refresh: 'Refresh', print: 'Print', users: 'Users', calendar: 'Calendar', lock: 'Lock',
  logout: 'Logout', alerts: 'Alerts', open: 'Open', closed: 'Closed', store: 'Store',
  theme: 'Theme', language: 'Language',
  ordersLog: 'Orders Log', newOrder: 'New Order (POS)', products: 'Products', categories: 'Categories',
  inventory: 'Inventory', stocktake: 'Stock Take', suppliersTab: 'Suppliers', manufacturingTab: 'Manufacturing',
  hr: 'Employees', expenses: 'Expenses', reports: 'Reports', audit: 'Audit', printer: 'Printer',
  usersTab: 'Users', shifts: 'Shifts', settingsTab: 'Settings', discounts: 'Discount Codes',
  approvals: 'Approvals', customerDisplay: 'Customer Display', mobile: 'App',
  save: 'Save', cancel: 'Cancel', close: 'Close', add: 'Add', search: 'Search', back: 'Back',
  returns: 'Returns', expensesShort: 'Expenses', openDrawer: 'Open drawer', printCopy: 'Print copy',
  preview: 'Preview receipt', hold: 'Hold (F9)', confirm: 'Confirm (F12)',
};

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: getLang(),
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export default i18n;
