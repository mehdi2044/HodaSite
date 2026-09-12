import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retainedBackups } from './retention.mjs';
test('retention keeps separate daily/week/month buckets and never selects manual or safety',()=>{
 const rows=[['new','2026-09-12T12:00:00Z','scheduled'],['same','2026-09-12T01:00:00Z','scheduled'],['previous','2026-09-05T01:00:00Z','scheduled'],['month','2026-08-20T01:00:00Z','scheduled'],['manual','2026-09-13T01:00:00Z','manual'],['safety','2026-09-13T01:00:00Z','safety']].map(([id,createdAt,kind])=>({id,createdAt,kind,status:'DONE'}));
 assert.deepEqual([...retainedBackups(rows,{keepDaily:1,keepWeekly:2,keepMonthly:2})].sort(),['month','new','previous']);
});
