import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scheduleDue, uploadFailureCode } from './contracts.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test('schedule preserves UTC minutes and fails closed on invalid time values', () => {
  const settings={hourUtc:3,minuteUtc:30};
  assert.equal(scheduleDue(new Date('2026-09-12T03:29:59Z'),settings),false);
  assert.equal(scheduleDue(new Date('2026-09-12T03:30:00Z'),settings),true);
  assert.equal(scheduleDue(new Date('2026-09-12T04:00:00Z'),settings),true);
  assert.equal(scheduleDue(new Date('2026-09-13T00:00:00Z'),settings),false);
  assert.equal(scheduleDue(new Date('2026-09-12T03:10:00Z'),{hourUtc:3}),false);
  for(const minuteUtc of [-1,60,1.5,'30']) assert.equal(scheduleDue(new Date(),{hourUtc:3,minuteUtc}),false);
});
test('validator emits bounded, translated reason codes at the actual process boundary', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'backup-validation-'));
  try {
    mkdirSync(path.join(dir,'scripts/ops'),{recursive:true});
    mkdirSync(path.join(dir,'scripts/backup'),{recursive:true});
    mkdirSync(path.join(dir,'prisma/migrations/initial'),{recursive:true});
    copyFileSync(path.join(root,'scripts/ops/validate-upload.sh'),path.join(dir,'scripts/ops/validate-upload.sh'));
    copyFileSync(path.join(root,'scripts/backup/lib.sh'),path.join(dir,'scripts/backup/lib.sh'));
    writeFileSync(path.join(dir,'scripts/backup/verify.sh'),'#!/bin/bash\n[[ $VALIDATOR_CASE != scratch ]]\n');
    const cases={valid:0,traversal:51,members:52,project:53,checksum:54,migrations:55,scratch:56};
    for(const [kind,expected] of Object.entries(cases)) {
      const zip=path.join(dir,`${kind}.zip`);
      const created=spawnSync('python3',['-c',`import sys,zipfile,json,hashlib
p,kind=sys.argv[1:]
manifest={'projectId':'other' if kind=='project' else 'test-project','migrations':['future' if kind=='migrations' else 'initial']}
files={'manifest.json':json.dumps(manifest).encode(),'db.dump':b'fixture'}
checks=''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\\n' for name,data in files.items())
files['checksums.sha256']=checks.encode()
if kind=='checksum': files['db.dump']=b'changed'
if kind=='members': files['unexpected.txt']=b'unsupported'
if kind=='traversal': files['../escape']=b'unsafe'
with zipfile.ZipFile(p,'w') as archive:
 for name,data in files.items(): archive.writestr(name,data)
`,zip,kind],{encoding:'utf8'});
      assert.equal(created.status,0,created.stderr);
      const result=spawnSync('bash',[path.join(dir,'scripts/ops/validate-upload.sh'),zip,path.join(dir,kind)],{env:{...process.env,PROJECT_ID:'test-project',APP_SRC:dir,VALIDATOR_CASE:kind},encoding:'utf8'});
      assert.equal(result.status,expected,`${kind}: ${result.stderr}`);
      if(expected) for(const locale of ['fa','tr','en']) {
        const messages=JSON.parse(readFileSync(path.join(root,`messages/${locale}.json`),'utf8'));
        assert.equal(typeof messages.backups[uploadFailureCode(expected)],'string');
      }
    }
    assert.equal(uploadFailureCode(null),'VALIDATION_FAILED');
    assert.equal(uploadFailureCode(137),'VALIDATION_FAILED');
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
