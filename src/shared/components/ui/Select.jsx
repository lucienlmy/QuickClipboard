function Select({
  value,
  onChange,
  options,
  className = ''
}) {
  return <select value={value} onChange={e => onChange(e.target.value)} className={`px-3 py-2 bg-qc-panel border border-qc-border rounded-lg text-qc-fg focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${className}`}>
      {options.map(option => <option key={option.value} value={option.value}>
          {option.label}
        </option>)}
    </select>;
}
export default Select;