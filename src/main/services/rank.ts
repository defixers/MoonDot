const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
// Variable-length base-62 fractional ranks; generated keys never end in the lowest digit.
export function rankBetween(lower: string | null, upper: string | null): string {
  if (lower !== null && upper !== null && lower >= upper) throw new Error('Invalid rank interval')
  let a = lower ?? '',
    b = upper,
    prefix = ''
  for (let index = 0; prefix.length < 128; index++) {
    const low = index < a.length ? digits.indexOf(a[index]!) : 0
    const high = b !== null && index < b.length ? digits.indexOf(b[index]!) : digits.length - 1
    if (high - low > 1) return prefix + digits[Math.floor((low + high) / 2)]
    prefix += digits[low]
    if (low !== high) {
      a = a.slice(index + 1)
      b = null
      index = -1
    }
  }
  throw new Error('Rank capacity exceeded')
}
