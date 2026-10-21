function toCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isCentAmount(value) {
  const cents = Number(value) * 100;
  return Number.isSafeInteger(Math.round(cents)) && Math.abs(cents - Math.round(cents)) < 1e-7;
}

function calculateCommission(estimatedValue, commissionRate = 10) {
  const value = Number(estimatedValue);
  const rate = Number(commissionRate);
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new RangeError('Commission requires a non-negative deal value and a rate between 0 and 100.');
  }
  return toCurrency(value * rate / 100);
}

module.exports = { toCurrency, isCentAmount, calculateCommission };
