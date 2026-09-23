// All indicators return arrays aligned with the input; values before there is
// enough data are NaN.

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function stdev(values: number[], period: number): number[] {
  const mean = sma(values, period);
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - mean[i]) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

// Wilder's smoothing, used by RSI, ATR and ADX.
function wilder(values: number[], period: number, start: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < start + period) return out;
  let prev = 0;
  for (let i = start; i < start + period; i++) prev += values[i];
  prev /= period;
  out[start + period - 1] = prev;
  for (let i = start + period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const gains = closes.map((c, i) => (i === 0 ? 0 : Math.max(c - closes[i - 1], 0)));
  const losses = closes.map((c, i) => (i === 0 ? 0 : Math.max(closes[i - 1] - c, 0)));
  const ag = wilder(gains, period, 1);
  const al = wilder(losses, period, 1);
  return ag.map((g, i) => {
    if (Number.isNaN(g)) return NaN;
    if (al[i] === 0) return 100;
    return 100 - 100 / (1 + g / al[i]);
  });
}

export function trueRange(h: number[], l: number[], c: number[]): number[] {
  return h.map((hi, i) =>
    i === 0 ? hi - l[i] : Math.max(hi - l[i], Math.abs(hi - c[i - 1]), Math.abs(l[i] - c[i - 1])),
  );
}

export function atr(h: number[], l: number[], c: number[], period = 14): number[] {
  return wilder(trueRange(h, l, c), period, 0);
}

export function adx(h: number[], l: number[], c: number[], period = 14): number[] {
  const plusDM = h.map((hi, i) => {
    if (i === 0) return 0;
    const up = hi - h[i - 1];
    const down = l[i - 1] - l[i];
    return up > down && up > 0 ? up : 0;
  });
  const minusDM = l.map((lo, i) => {
    if (i === 0) return 0;
    const up = h[i] - h[i - 1];
    const down = l[i - 1] - lo;
    return down > up && down > 0 ? down : 0;
  });
  const tr = wilder(trueRange(h, l, c), period, 1);
  const pdm = wilder(plusDM, period, 1);
  const mdm = wilder(minusDM, period, 1);
  const dx = tr.map((t, i) => {
    if (Number.isNaN(t) || t === 0) return NaN;
    const pdi = (100 * pdm[i]) / t;
    const mdi = (100 * mdm[i]) / t;
    return pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
  });
  const firstValid = dx.findIndex((v) => !Number.isNaN(v));
  if (firstValid < 0) return dx.map(() => NaN);
  return wilder(dx, period, firstValid);
}

// Highest high / lowest low of the `period` candles BEFORE index i.
export function priorHigh(h: number[], period: number): number[] {
  return h.map((_, i) => (i < period ? NaN : Math.max(...h.slice(i - period, i))));
}

export function priorLow(l: number[], period: number): number[] {
  return l.map((_, i) => (i < period ? NaN : Math.min(...l.slice(i - period, i))));
}

export function rollingMedian(values: number[], period: number): number[] {
  return values.map((_, i) => {
    if (i < period - 1) return NaN;
    const w = values.slice(i - period + 1, i + 1).filter((v) => !Number.isNaN(v));
    if (w.length === 0) return NaN;
    w.sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
