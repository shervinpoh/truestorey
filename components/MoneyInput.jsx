'use client';
import { useLayoutEffect, useRef } from 'react';

/**
 * A money field that reads like money.
 *
 * Every calculator on this site took a bare `type="number"`, so a reader
 * checking whether they had typed six hundred and fifty thousand or six
 * million was counting digits: `650000` against `6500000`. On the one page
 * where a misplaced zero changes the answer by a factor of ten, that is the
 * wrong place to make someone count.
 *
 * WHY NOT type="number". It cannot show a thousands separator at all — the
 * value has to parse as a number, and "650,000" does not. It also brings
 * spinners nobody wants and a scroll-wheel behaviour that silently changes
 * figures when you scroll past the field. `inputMode="numeric"` gets the
 * numeric keypad on a phone, which is the only part of type="number" this
 * needed.
 *
 * THE CARET. Reformatting on every keystroke moves the text under the cursor,
 * so typing a digit in the middle of "1,250,000" would normally throw the
 * caret to the end. The fix is to count DIGITS before the caret rather than
 * characters, reformat, then walk forward to the same digit count. Commas
 * shift; digits do not.
 *
 * Format-on-blur was the cheaper option and it is worse: the digits are raw
 * for exactly as long as you are looking at them.
 */
const digitsBefore = (s, caret) => {
  let n = 0;
  for (let i = 0; i < caret && i < s.length; i++) if (s[i] >= '0' && s[i] <= '9') n++;
  return n;
};
const caretAfterDigits = (s, n) => {
  if (n === 0) return 0;
  let seen = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] >= '0' && s[i] <= '9') seen++;
    if (seen === n) return i + 1;
  }
  return s.length;
};

export default function MoneyInput({
  value, onChange, prefix = 'S$', slider = false, min = 0, max, step = 1000,
  emptyIsBlank = false, id, ariaLabel, ...rest
}) {
  const ref = useRef(null);
  const caretRef = useRef(null);

  // An empty field stays empty so its placeholder can show. Rendering "S$0"
  // into a field nobody has touched asks the reader to clear it before they
  // can type, and reads as an answer rather than a prompt.
  const empty = value === '' || value == null;
  const shown = empty || !Number.isFinite(Number(value))
    ? ''
    : prefix + Number(value).toLocaleString('en-SG');

  // Restore the caret after React has painted the reformatted string.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caretRef.current == null) return;
    const at = caretAfterDigits(el.value, caretRef.current);
    el.setSelectionRange(at, at);
    caretRef.current = null;
  });

  const handle = e => {
    const el = e.target;
    caretRef.current = digitsBefore(el.value, el.selectionStart ?? el.value.length);
    const digits = el.value.replace(/\D/g, '');
    // Clearing the field gives back '' rather than 0 when it started empty, so
    // a "not answered yet" field can stay distinguishable from a zero.
    onChange(digits === '' ? (emptyIsBlank ? '' : 0) : Number(digits));
  };

  return (
    <>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        aria-label={ariaLabel}
        value={shown}
        onChange={handle}
        {...rest}
      />
      {slider && Number.isFinite(max) && (
        /* The slider writes the same state the box does, so dragging updates
           the text and typing moves the thumb. It is aria-hidden and not
           focusable: it duplicates a control that is already labelled, and a
           screen reader landing on both would hear the same field twice. */
        <input
          type="range"
          aria-hidden="true"
          tabIndex={-1}
          min={min}
          max={max}
          step={step}
          value={Math.min(Math.max(Number(value) || 0, min), max)}
          onChange={e => onChange(Number(e.target.value))}
        />
      )}
    </>
  );
}
