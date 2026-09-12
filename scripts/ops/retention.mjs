/** Newest backup per UTC day/week/month; manual/safety backups are never selected. */
export function retainedBackups(rows, settings) {
  const keep = new Set();
  for (const [kind, count] of [['day',settings.keepDaily],['week',settings.keepWeekly],['month',settings.keepMonthly]]) {
    const groups = new Set();
    for (const row of [...rows].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))) {
      if(row.kind !== 'scheduled' || row.status !== 'DONE') continue;
      const date = new Date(row.createdAt);
      if(kind === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay()+6)%7);
      const group = date.toISOString().slice(0,kind === 'month'?7:10);
      if(groups.has(group) || groups.size >= count) continue;
      groups.add(group);keep.add(row.id);
    }
  }
  return keep;
}
