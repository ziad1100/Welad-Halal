import { useId } from 'react';

/** Thin native datalist wrapper for small static option sets (type → filter). */
export function SearchableDatalist({
  label, value, options, onChange, placeholder, disabled, width,
}: {
  label?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  width?: number | string;
}) {
  const autoId = useId();
  const listId = `${autoId}-dl`;
  // Native datalist matches on the input value: keep label text in the field
  // and map back to the option value on change.
  const shown = options.find((o) => o.value === value)?.label ?? value;
  return (
    <span className="sdl" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {label && <span className="klabel">{label}</span>}
      <input
        className="kinput"
        list={listId}
        value={shown}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        style={width !== undefined ? { width } : undefined}
        onChange={(e) => {
          const v = e.target.value;
          const hit = options.find((o) => o.label === v || o.value === v);
          onChange(hit ? hit.value : v);
        }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.value} value={o.label}>{o.label}</option>
        ))}
      </datalist>
    </span>
  );
}
