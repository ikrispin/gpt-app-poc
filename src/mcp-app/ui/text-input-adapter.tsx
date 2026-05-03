type TextInputAdapterProps = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

export function TextInputAdapter({ id, label, value, placeholder, onChange }: TextInputAdapterProps) {
  return (
    <div className="rhds-field-group">
      <label className="rhds-field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="rhds-input"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
