const COMMISSION_PACKAGES = {
  essential_starter: { label: 'Essential Starter', minimum: 500, maximum: 500 },
  growth_professional: { label: 'Growth Professional', minimum: 750, maximum: 750 },
  complete_academy: { label: 'Complete Academy', minimum: 1000, maximum: 1000 },
  institutional_flagship: { label: 'Institutional Flagship', minimum: 1500, maximum: 3000 },
};

function calculatePackageCommission(packageKey, customAmount) {
  const selectedPackage = COMMISSION_PACKAGES[packageKey];
  if (!selectedPackage) {
    throw new RangeError('Select a valid closed-deal package.');
  }
  const amount = packageKey === 'institutional_flagship'
    ? Number(customAmount)
    : selectedPackage.minimum;
  if (
    !Number.isFinite(amount)
    || amount < selectedPackage.minimum
    || amount > selectedPackage.maximum
    || Math.round(amount * 100) !== amount * 100
  ) {
    throw new RangeError(`${selectedPackage.label} commission must be between R${selectedPackage.minimum} and R${selectedPackage.maximum}.`);
  }
  return { packageKey, packageLabel: selectedPackage.label, amount };
}

module.exports = { COMMISSION_PACKAGES, calculatePackageCommission };
