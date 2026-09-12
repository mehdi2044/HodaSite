export function backupLabel(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw Error('INVALID_REQUEST');
  // Existing backup CLI truncates labels to 40 chars; preserve all 128 UUID bits.
  return `panel-${id.replaceAll('-', '')}`;
}

export function scheduleDue(now, settings) {
  const minute=settings.minuteUtc ?? 30;
  if (!Number.isInteger(settings.hourUtc) || settings.hourUtc<0 || settings.hourUtc>23 || !Number.isInteger(minute) || minute<0 || minute>59) return false;
  return now.getUTCHours()*60+now.getUTCMinutes() >= settings.hourUtc*60+minute;
}
export function uploadFailureCode(exitCode) {
  return ({51:'ARCHIVE_INVALID',52:'ARCHIVE_MEMBERS',53:'ARCHIVE_PROJECT',54:'ARCHIVE_CHECKSUM',55:'ARCHIVE_MIGRATIONS',56:'ARCHIVE_RESTORE'})[exitCode] ?? 'VALIDATION_FAILED';
}
