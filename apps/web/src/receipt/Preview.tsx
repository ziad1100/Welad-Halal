import { useState } from 'react';
import { Modal } from '../components/shared/ui';
import { wrapForWidth } from './ReceiptRenderer';
import { loadPrinterConfig } from './configStore';
import type { PaperWidth } from './types';
import { LINE_WIDTH } from './ReceiptTemplate';

/** Thermal-width preview resembling the printed receipt (58/80 toggle). */
export function ReceiptPreview({ lines, onClose }: { lines: string[]; onClose: () => void }) {
  const [width, setWidth] = useState<PaperWidth>(loadPrinterConfig().paperWidth);
  const wrapped = wrapForWidth(lines, width);
  const px = width === 58 ? 240 : 340;
  return (
    <Modal title="معاينة الفاتورة" onClose={onClose} footer={<button className="kbtn" onClick={onClose}>إغلاق</button>}>
      <div className="krow">
        <button className="kbtn" onClick={() => setWidth(58)} style={width === 58 ? { background: 'var(--k-selected)', color: '#fff' } : {}}>58mm</button>
        <button className="kbtn" onClick={() => setWidth(80)} style={width === 80 ? { background: 'var(--k-selected)', color: '#fff' } : {}}>80mm</button>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>العرض: {LINE_WIDTH[width]} حرف</span>
      </div>
      <div style={{ width: px, margin: '0 auto', background: '#fff', color: '#111', border: '1px dashed #999', padding: 10, fontFamily: 'Tahoma', fontSize: 13 }}>
        {wrapped.map((l, i) => <div key={i} style={{ whiteSpace: 'pre-wrap', textAlign: 'center', minHeight: 18 }}>{l || ' '}</div>)}
      </div>
    </Modal>
  );
}
