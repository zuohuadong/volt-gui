export function sourceIndexOf(source, needle, label = needle) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Source contract missing: ${JSON.stringify(label)}`);
  return index;
}

export function assertSourceOrder(source, entries, message = "Source contract order mismatch") {
  const indexes = {};
  let previous = -1;
  for (const entry of entries) {
    const needle = typeof entry === "string" ? entry : entry.needle;
    const label = typeof entry === "string" ? entry : (entry.label ?? entry.needle);
    const index = sourceIndexOf(source, needle, label);
    if (index < previous) throw new Error(`${message}: ${JSON.stringify(label)}`);
    indexes[label] = index;
    previous = index;
  }
  return indexes;
}
