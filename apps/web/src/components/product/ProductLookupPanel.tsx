import { useAuth } from '../../store/auth';
import { useProductLookup, type ProductLookupResult } from '../../hooks/useProductLookup';
import { useDir } from '../../store/lang';

/**
 * §2 — Shared product lookup panel: renders the FULL product record in a
 * consistent card layout. Used across Cashier, Inventory, Purchases,
 * Stock Take, and New Product registration screens.
 *
 * Role-based visibility: Employee level hides cost/supplier data;
 * Manager/Owner sees everything (§3).
 */
type Mode = 'cashier' | 'inventory' | 'purchases' | 'stocktake' | 'new-product-check';

interface Props {
  code: string;
  mode: Mode;
  onClose?: () => void;
  onAddToCart?: (product: ProductLookupResult) => void;
  onPrefill?: (product: ProductLookupResult) => void;
}

const TYPE_AR: Record<string, string> = {
  INVENTORY_ITEM: 'صنف مخزون',
  SERVICE_ITEM: 'خدمة',
  RAW_MATERIAL: 'مادة خام',
  BUNDLED_ITEM: 'صنف مجمع',
};

export function ProductLookupPanel({ code, mode, onClose, onAddToCart, onPrefill }: Props) {
  const dir = useDir();
  const { user } = useAuth();
  const isManager = !!user && user.permissionLevel >= 50;
  const { data: product, isLoading, error } = useProductLookup(code);

  if (isLoading) {
    return (
      <div className="kpanel" dir={dir} style={{ padding: 12 }}>
        <span style={{ color: 'var(--muted)' }}>جاري البحث عن الباركود…</span>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="kpanel" dir={dir} style={{ padding: 12, borderColor: '#E5484D' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#E5484D' }}>المنتج غير موجود: {code}</span>
          {onClose && <button className="kbtn" onClick={onClose}>إغلاق</button>}
        </div>
        {mode === 'new-product-check' && onPrefill && (
          <button className="kbtn kbtn-primary" style={{ marginTop: 8 }} onClick={() => onPrefill(null as any)}>
            تسجيل منتج جديد بهذا الباركود
          </button>
        )}
      </div>
    );
  }

  const stock = product.inventory ? Number(product.inventory.quantity) : null;
  const minStock = product.inventory ? Number(product.inventory.minimumQuantity) : null;
  const lowStock = stock !== null && minStock !== null && stock <= minStock;

  return (
    <div className="kpanel" dir={dir} style={{ padding: 12, position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{product.nameAr || product.name}</div>
          {product.nameAr && product.name && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{product.name}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span className="kstatus">{TYPE_AR[product.productType] || product.productType}</span>
            {product.barcode && <span style={{ color: 'var(--muted)', fontSize: 12 }}>باركود: {product.barcode}</span>}
            {product.sku && <span style={{ color: 'var(--muted)', fontSize: 12 }}>SKU: {product.sku}</span>}
          </div>
        </div>
        {onClose && <button className="kbtn" onClick={onClose} style={{ flexShrink: 0 }}>X</button>}
      </div>

      {/* Description */}
      {product.description && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{product.description}</div>
      )}

      {/* Pricing & Stock */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
        <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>سعر البيع</span><br /><b style={{ fontSize: 16 }}>{Number(product.retailPrice).toFixed(2)}</b> ج.م</div>
        {isManager && (
          <>
            <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>سعر الشراء</span><br /><b style={{ fontSize: 16 }}>{Number(product.purchasePrice).toFixed(2)}</b> ج.م</div>
            {product.lastPurchasePrice != null && (
              <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>آخر شراء</span><br /><b>{Number(product.lastPurchasePrice).toFixed(2)}</b> ج.م
                {product.lastPurchaseDate && <span style={{ fontSize: 10, color: 'var(--muted)' }}> ({new Date(product.lastPurchaseDate).toLocaleDateString('ar-EG')})</span>}
              </div>
            )}
          </>
        )}
        <div>
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>الرصيد</span><br />
          <b style={{ fontSize: 16, color: lowStock ? '#E5484D' : undefined }}>{stock ?? '—'}</b> {product.unit}
          {lowStock && <span style={{ color: '#E5484D', fontSize: 11, marginLeft: 4 }}>⚠ منخفض</span>}
        </div>
        <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>الضريبة</span><br />{Number(product.taxRate)}%</div>
      </div>

      {/* Supplier — Manager/Owner only */}
      {isManager && product.supplier && (
        <div style={{ fontSize: 12, marginBottom: 8, padding: '4px 8px', background: 'var(--surface-2)', borderRadius: 4 }}>
          المورد: <b>{product.supplier.name}</b>
          {product.supplier.phone && <span style={{ color: 'var(--muted)' }}> — {product.supplier.phone}</span>}
        </div>
      )}

      {/* Sub-units */}
      {product.subUnits && product.subUnits.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>وحدات القياس</div>
          <table className="ktable" style={{ fontSize: 12 }}>
            <thead><tr><th>الوحدة</th><th>المعامل</th><th>السعر</th></tr></thead>
            <tbody>
              <tr><td>{product.unit} (افتراضي)</td><td>1</td><td>{Number(product.retailPrice).toFixed(2)}</td></tr>
              {product.subUnits.map((u, i) => (
                <tr key={i}><td>{u.unit}</td><td>{u.factor}</td><td>{Number(u.price).toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Price tiers */}
      {product.priceTiers && product.priceTiers.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>فئات الأسعار</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {product.priceTiers.map((t, i) => (
              <span key={i} className="kstatus">{t.tier}: {Number(t.price).toFixed(2)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Expiry / Batches */}
      {product.nearestExpiry && (
        <div style={{ marginBottom: 8, padding: '4px 8px', background: '#FFF3CD', borderRadius: 4, fontSize: 12 }}>
          أقرب انتهاء: {product.nearestExpiry.batchNo || '—'} — {product.nearestExpiry.expiryDate ? new Date(product.nearestExpiry.expiryDate).toLocaleDateString('ar-EG') : '—'}
          {product.nearestExpiry.daysLeft != null && <span style={{ fontWeight: 700 }}> (متبقي {product.nearestExpiry.daysLeft} يوم)</span>}
        </div>
      )}

      {/* BOM / Components — Manager/Owner only */}
      {isManager && product.productType === 'BUNDLED_ITEM' && product.components && product.components.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>المكونات (BOM)</div>
          <table className="ktable" style={{ fontSize: 12 }}>
            <thead><tr><th>المكون</th><th>الكمية/وحدة</th><th>الرصيد</th></tr></thead>
            <tbody>
              {product.components.map((c) => (
                <tr key={c.componentId}>
                  <td>{c.component.nameAr || c.component.name}</td>
                  <td>{Number(c.quantity)} {c.component.unit}</td>
                  <td style={{ color: c.component.inventory && Number(c.component.inventory.quantity) <= 0 ? '#E5484D' : undefined }}>
                    {c.component.inventory ? Number(c.component.inventory.quantity) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Category */}
      {product.category && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
          التصنيف: {product.category.nameAr || product.category.name}
        </div>
      )}

      {/* Mode-specific action buttons */}
      {mode === 'cashier' && onAddToCart && (
        <button className="kbtn kbtn-primary" style={{ width: '100%', marginTop: 4 }} onClick={() => onAddToCart(product)}>
          إضافة إلى السلة — {Number(product.retailPrice).toFixed(2)} ج.م
        </button>
      )}
      {mode === 'purchases' && isManager && (
        <button className="kbtn" style={{ width: '100%', marginTop: 4 }} onClick={() => onPrefill?.(product)}>
          استخدام سعر الشراء الأخير ({product.lastPurchasePrice != null ? `${Number(product.lastPurchasePrice).toFixed(2)} ج.م` : '—'})
        </button>
      )}
    </div>
  );
}
