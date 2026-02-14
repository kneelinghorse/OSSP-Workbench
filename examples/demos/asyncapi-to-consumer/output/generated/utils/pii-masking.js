export function maskPII(value, piiPaths) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const clone = JSON.parse(JSON.stringify(value));

  for (const path of piiPaths || []) {
    if (!path) {
      continue;
    }

    const segments = String(path).split('.');
    let node = clone;

    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!node || typeof node !== 'object' || !(segment in node)) {
        node = null;
        break;
      }
      node = node[segment];
    }

    if (!node || typeof node !== 'object') {
      continue;
    }

    const finalKey = segments[segments.length - 1];
    if (!(finalKey in node)) {
      continue;
    }

    const original = String(node[finalKey] ?? '');
    node[finalKey] = original.length <= 4 ? '****' : original.slice(0, 2) + '***' + original.slice(-2);
  }

  return clone;
}
