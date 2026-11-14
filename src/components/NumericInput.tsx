import React, { useState, useEffect, useRef } from 'react';

export interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Robust numeric input designed for engineering tools:
 * - Allows the user to freely clear the field (empty string "") without immediate reset.
 * - Selecting all or typing multi-digit numbers (like 20, 100, 0.05) works seamlessly.
 * - External prop updates do NOT overwrite text while the user is actively focused/typing.
 * - Clamping to min/max happens safely on blur without blocking intermediate typing.
 * - Auto-selects text on focus for fast replacement.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  min,
  max,
  placeholder,
  className = '',
  autoFocus,
}) => {
  const [text, setText] = useState<string>(() => (Number.isFinite(value) ? String(value) : ''));
  const isFocusedRef = useRef<boolean>(false);

  // Synchronize when the external value changes, but ONLY when the user is not actively typing
  useEffect(() => {
    if (isFocusedRef.current) {
      return;
    }
    const currentParsed = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(currentParsed) && currentParsed === value) {
      return;
    }
    setText(Number.isFinite(value) ? String(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);

    // If empty or partial symbol, allow user to keep typing without calling onChange
    const trimmed = val.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '+' || trimmed === '.' || trimmed === ',') {
      return;
    }

    const parsed = parseFloat(trimmed.replace(',', '.'));
    if (!Number.isNaN(parsed)) {
      // Do not block typing intermediate values like "0" or "0." even if min is e.g. 0.001
      if (max !== undefined && parsed > max) {
        return;
      }
      onChange(parsed);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    e.target.select();
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    const trimmed = text.trim();

    if (trimmed === '' || Number.isNaN(parseFloat(trimmed.replace(',', '.')))) {
      // If left empty or invalid on blur, fallback to valid value or min
      const fallback = min !== undefined ? Math.max(min, value || 1) : (value || 0);
      setText(String(fallback));
      onChange(fallback);
      return;
    }

    let parsed = parseFloat(trimmed.replace(',', '.'));
    if (min !== undefined && parsed < min) {
      parsed = min;
    }
    if (max !== undefined && parsed > max) {
      parsed = max;
    }

    setText(String(parsed));
    onChange(parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      isFocusedRef.current = false;
      setText(Number.isFinite(value) ? String(value) : '');
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
      spellCheck={false}
      autoComplete="off"
    />
  );
};
