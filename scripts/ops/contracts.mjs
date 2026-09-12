export function backupLabel(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw Error('INVALID_REQUEST');
  // Existing backup CLI truncates labels to 40 chars; preserve all 128 UUID bits.
  return `panel-${id.replaceAll('-', '')}`;
}
