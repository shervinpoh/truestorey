export const f  = n => 'S$' + Math.round(n).toLocaleString('en-SG');
/* A plain count. f() is money and prefixes S$, which is wrong on "5,762 sales". */
export const num = n => Math.round(n).toLocaleString('en-SG');
export const fk = n => 'S$' + Math.round(n/1000).toLocaleString('en-SG') + 'k';
export const mLabel = m => {
  const [y, mo] = String(m).split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+mo-1] + " '" + y.slice(2);
};
