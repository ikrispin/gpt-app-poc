type SelectOption = {
  value: string;
  label: string;
};

type SelectAdapterProps = {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
};

export function SelectAdapter({ id, label, value, options, onChange }: SelectAdapterProps) {
  return (
    <div className="rhds-field-group">
      <label className="rhds-field-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="rhds-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
