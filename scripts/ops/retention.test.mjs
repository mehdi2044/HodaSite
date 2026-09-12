import { backupLabel } from './contracts.mjs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retainedBackups } from './retention.mjs';
test('retention keeps separate daily/week/month buckets and never selects manual or safety',()=>{
 const rows=[['new','2026-09-12T12:00:00Z','scheduled'],['same','2026-09-12T01:00:00Z','scheduled'],['previous','2026-09-05T01:00:00Z','scheduled'],['month','2026-08-20T01:00:00Z','scheduled'],['manual','2026-09-13T01:00:00Z','manual'],['safety','2026-09-13T01:00:00Z','safety']].map(([id,createdAt,kind])=>({id,createdAt,kind,status:'DONE'}));
 assert.deepEqual([...retainedBackups(rows,{keepDaily:1,keepWeekly:2,keepMonthly:2})].sort(),['month','new','previous']);
});

test('panel task labels preserve UUID uniqueness within the backup CLI 40-character contract',()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 const label=backupLabel(id);
 assert.equal(execFileSync('bash',['-c','source scripts/backup/lib.sh; sanitize_label "$1"','label-test',label],{encoding:'utf8'}).trimEnd(),label);
 assert.equal(label.length,38);assert.match(label,/^[a-z0-9-]+$/);
});
