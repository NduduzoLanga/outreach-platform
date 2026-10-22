function splitFullName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' '),
  };
}

function combineName(firstName, lastName) {
  return [firstName, lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

module.exports = { combineName, splitFullName };
