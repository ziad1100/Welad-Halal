import { useEffect, useState } from 'react';
import { Modal } from '../components/shared/ui';
import { wrapStyled } from './ReceiptRenderer';
import { loadPrinterConfig } from './configStore';
import type { PaperWidth } from './types';
import type { StyledLine } from './ReceiptTemplate';
import { LINE_WIDTH } from './ReceiptTemplate';
import { qrDataUrl } from './qr';

const SIZE_PX = { xl: 26, lg: 20, normal: 13, sm: 11 } as const;

/** §1 — inline QR graphic for qr-marked preview lines. */
function QrCell({ url }: { url: string }) {
  const [img, setImg] = useState('');
  useEffect(() => { let on = true; qrDataUrl(url, 96).then((d) => { if (on && d) setImg(d); }); return () => { on = false; }; }, [url]);
  return <div style={{ textAlign: 'center' }}>{img ? <img src={img} style={{ width: 90, height: 90 }} alt="QR" /> : <span style={{ fontSize: 9 }}>••••</span>}</div>;
}

/** Thermal-width preview of the exact print layout (58/80 toggle), styles included. */
export function ReceiptPreview({ lines, onClose }: { lines: StyledLine[]; onClose: () => void }) {
  const [width, setWidth] = useState<PaperWidth>(loadPrinterConfig().paperWidth);
  const wrapped = wrapStyled(lines, width);
  const px = width === 58 ? 240 : 340;
  return (
    <Modal title="معاينة الفاتورة" onClose={onClose} footer={<button className="kbtn" onClick={onClose}>إغلاق</button>}>
      <div className="krow">
        <button className="kbtn" onClick={() => setWidth(58)} style={width === 58 ? { background: 'var(--k-selected)', color: '#fff' } : {}}>58mm</button>
        <button className="kbtn" onClick={() => setWidth(80)} style={width === 80 ? { background: 'var(--k-selected)', color: '#fff' } : {}}>80mm</button>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>العرض: {LINE_WIDTH[width]} حرف</span>
      </div>
      <div style={{ width: px, margin: '0 auto', background: '#fff', color: '#111', border: '1px dashed #999', padding: 10, fontFamily: "'Courier New', monospace", fontSize: 13 }}>
        {wrapped.map((l, i) => {
          const st = l.style || {};
          if (st.qr && st.qrUrl) return <QrCell key={i} url={st.qrUrl} />;
          const size = SIZE_PX[st.size || 'normal'];
          return (
            <div key={i} style={{
              whiteSpace: 'pre-wrap',
              textAlign: st.align === 'center' ? 'center' : 'right',
              fontSize: size,
              fontWeight: st.bold ? 'bold' : 'normal',
              lineHeight: `${Math.round(size * 1.35)}px`,
            }}>{l.text || ' '}</div>
          );
        })}
      </div>
    </Modal>
  );
}
