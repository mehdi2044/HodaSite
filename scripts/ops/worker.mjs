import { backupLabel, scheduleDue, uploadFailureCode } from './contracts.mjs';
import { retainedBackups } from './retention.mjs';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const db = new PrismaClient();
const root = process.env.BACKUP_ROOT || '/backups';
const uploads = process.env.BACKUP_UPLOAD_ROOT || '/backup-uploads';
const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const journal = path.join(root, 'operations');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = /^20\d{2}-\d{2}-\d{2}_[0-9_]+_[a-zA-Z0-9_-]+$/;
function checked(value, pattern) { if (typeof value !== 'string' || !pattern.test(value)) throw Error('INVALID_REQUEST'); return value; }
function global(scope) { return scope == null || (typeof scope === 'object' && !Array.isArray(scope) && Object.keys(scope).length === 0); }
async function authorized(task) {
  if (!task.requestedBy) return task.requestKey.startsWith('schedule:') && ['BACKUP','VERIFY'].includes(task.type);
  const u = await db.user.findUnique({ where: { id: task.requestedBy }, include: { overrides: true, roles: { include: { role: { include: { permissions: true } } } } } });
  const p = task.type === 'BACKUP' ? 'backup.create' : task.type === 'RESTORE' ? 'backup.restore' : task.type === 'VALIDATE_UPLOAD' ? 'backup.upload' : 'backup.view';
  if (!u?.isActive) return false;
  const overrides = u.overrides.filter(o => o.permission === p && global(o.scope));
  if (overrides.some(o => !o.allow)) return false;
  const granted = overrides.some(o => o.allow) || u.roles.some(r => global(r.scope) && r.role.permissions.some(x => [p,'*'].includes(x.permission)));
  if (!granted) return false;
  if (['RESTORE','VALIDATE_UPLOAD'].includes(task.type) && (!u.mfaEnabled || !u.roles.some(r => r.role.key === 'owner' && global(r.scope)))) return false;
  return task.type !== 'RESTORE' || (task.authorizedAt && Date.now() - new Date(task.authorizedAt).getTime() < 300000 && new Date(task.authorizedAt).getTime() <= Date.now());
}
async function execute(command, args, task, label) {
  await db.opsTask.updateMany({ where: { id: task.id }, data: { log: label } });
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'ignore'], env: process.env });
    child.on('error', () => reject(Error('COMMAND_FAILED')));
    child.on('exit', code => code === 0 ? resolve() : reject(Object.assign(Error('COMMAND_FAILED'), { exitCode: code })));
  });
}
async function record(task, status, result = {}) {
  const data = { status, result, log: result.stage || status, finishedAt: new Date() };
  await db.opsTask.upsert({ where: { id: task.id }, create: { id: task.id, requestKey: task.requestKey, type: task.type, requestedBy: task.requestedBy, authorizedAt: task.authorizedAt, payload: task.payload, ...data }, update: data });
  if (task.type === 'RESTORE') await db.restoreRequest.upsert({ where: { id: task.id }, create: { id: task.id, requestedBy: task.requestedBy, backupId: task.payload.backupId, uploadedFileKey: task.payload.uploadId ? `${task.payload.uploadId}.zip` : null, mode: task.payload.mode, mfaVerifiedAt: task.authorizedAt, status, log: status, finishedAt: new Date() }, update: { status, log: status, finishedAt: new Date() } });
}
async function exportBackup(fileKey, task) {
  const directory = path.join(root, checked(fileKey, key));
  const names = ['db.dump', 'manifest.json', 'checksums.sha256'];
  if (await stat(path.join(directory,'media.tar.zst')).catch(() => null)) names.push('media.tar.zst');
  const dest = path.join(root, 'exports', `${fileKey}.zip`);
  const temp = `${dest}.tmp.zip`;
  await rm(temp, { force: true });
  // zip -j includes only generated members. No caller-provided arguments or shell.
  await execute('zip', ['-q','-j',temp,...names.map(n => path.join(directory,n))], task, 'EXPORT');
  await rename(temp, dest);
}
async function processTask(task) {
  checked(task.id, uuid);
  const marker = path.join(journal, `${task.id}.json`);
  // Persistent write-before-execute marker survives restoring an older DB.
  const handle = await open(marker, 'wx').catch(e => { if(e.code === 'EEXIST') return null; throw e; });
  if (!handle) { await record(task, 'FAILED', { reason: 'ALREADY_EXECUTED' }); return; }
  try { await handle.writeFile(JSON.stringify({ ...task, state: 'STARTED' })); await handle.sync(); } finally { await handle.close(); }
  let status = 'FAILED'; let result = {};
  try {
    if (!(await authorized(task))) throw Error('FORBIDDEN');
    await db.opsTask.update({ where: { id: task.id }, data: { status: 'RUNNING', startedAt: new Date(), log: 'RUNNING' } });
    const p = task.payload;
    if (task.type === 'BACKUP') {
      const label = backupLabel(task.id);
      await execute('bash', [path.join(scripts,'backup/backup.sh'),'--label',label,'--kind',task.requestedBy ? 'manual' : 'scheduled',...(p.includeMedia === false ? ['--no-media'] : [])], task, 'BACKUP');
      const backup = await db.backup.findFirstOrThrow({ where: { fileKey: { endsWith: `_${label}` } }, orderBy: { createdAt: 'desc' } });
      await db.backup.update({ where: { id: backup.id }, data: { createdBy: task.requestedBy } });
      await exportBackup(backup.fileKey,task); result = { backupId: backup.id };
    } else if (['VERIFY','EXPORT'].includes(task.type)) {
      const backup = await db.backup.findFirstOrThrow({ where: { id: p.backupId, status: 'DONE', localPrunedAt: null } });
      const source = path.join(root, checked(backup.fileKey,key));
      if (task.type === 'EXPORT') await exportBackup(backup.fileKey,task);
      else {
        try { await execute('bash',[path.join(scripts,'backup/verify.sh'),source],task,'VERIFY'); await db.backup.update({ where: { id: backup.id }, data: { verifiedAt: new Date(), verifyResult: { ok: true } } }); }
        catch(e) { await db.backup.update({ where: { id: backup.id }, data: { verifyResult: { ok: false, at: new Date().toISOString() } } }); throw e; }
      }
    } else if (task.type === 'VALIDATE_UPLOAD') {
      const id = checked(p.uploadId,uuid);
      await db.backupUpload.findFirstOrThrow({ where: { id, ownerId: task.requestedBy, status: 'UPLOADED', expiresAt: { gt: new Date() } } });
      await db.backupUpload.update({ where: { id }, data: { status: 'VALIDATING' } });
      const directory = path.join(root,'validated',id);
      await rm(directory,{recursive:true,force:true});
      try { await execute('bash',[path.join(scripts,'ops/validate-upload.sh'),path.join(uploads,`${id}.zip`),directory],task,'VALIDATE'); await db.backupUpload.update({where:{id},data:{status:'READY'}}); }
      catch(e) { await db.backupUpload.update({where:{id},data:{status:'FAILED',error:uploadFailureCode(e.exitCode)}}); await rm(directory,{recursive:true,force:true}); throw e; }
    } else if (task.type === 'RESTORE') {
      let source;
      if (!['FULL','DB_ONLY','MEDIA_ONLY'].includes(p.mode)) throw Error('INVALID_REQUEST');
      if (p.uploadId && !p.backupId) {
        const id=checked(p.uploadId,uuid);
        await db.backupUpload.findFirstOrThrow({where:{id,ownerId:task.requestedBy,status:'READY',expiresAt:{gt:new Date()}}});
        source=path.join(root,'validated',id);
      } else if(p.backupId && !p.uploadId) {
        const backup=await db.backup.findFirstOrThrow({where:{id:p.backupId,status:'DONE',localPrunedAt:null}});
        source=path.join(root,checked(backup.fileKey,key));
      } else throw Error('INVALID_REQUEST');
      await db.restoreRequest.update({where:{id:task.id},data:{status:'RUNNING',startedAt:new Date()}});
      await execute('bash',[path.join(scripts,'backup/restore.sh'),source,'--yes',...(p.mode==='DB_ONLY'?['--db-only']:p.mode==='MEDIA_ONLY'?['--media-only']:[])],task,'RESTORE');
    } else throw Error('INVALID_REQUEST');
    status='DONE';
  } catch { const row=await db.opsTask.findUnique({where:{id:task.id}}).catch(()=>null); result={reason:'OPERATION_FAILED',stage:row?.log || 'RUNNING'}; }
  // Persist terminal status before recreating task rows lost by pg_restore.
  const temp=`${marker}.tmp`;
  await writeFile(temp,JSON.stringify({...task,state:status,result})); await rename(temp,marker);
  await record(task,status,result);
  if(task.type==='RESTORE' && status==='DONE') await recover();
  if(status==='FAILED') await db.systemAlert.create({data:{severity:'CRITICAL',code:'BACKUP_OPERATION_FAILED',message:`Backup operation ${task.type} failed (${task.id})`}});
}
async function reconcileBackupCatalog() {
  for(const entry of await readdir(root,{withFileTypes:true})) {
    if(!entry.isDirectory() || !key.test(entry.name)) continue;
    if(await db.backup.findFirst({where:{fileKey:entry.name}})) continue;
    const directory=path.join(root,entry.name);
    const manifest=await readFile(path.join(directory,'manifest.json'),'utf8').then(JSON.parse).catch(()=>null);
    if(!manifest || manifest.projectId!==process.env.PROJECT_ID || !['manual','scheduled','safety'].includes(manifest.kind)) continue;
    const names=['db.dump','manifest.json','checksums.sha256',...(manifest.withMedia?['media.tar.zst']:[])];
    const files=await Promise.all(names.map(n=>stat(path.join(directory,n)).catch(()=>null)));
    if(files.some(f=>!f?.isFile())) continue;
    const bytes=files.reduce((n,f)=>n+BigInt(f.size),0n);
    await db.backup.create({data:{kind:manifest.kind,status:'DONE',fileKey:entry.name,sizeBytes:bytes,mediaIncluded:Boolean(manifest.withMedia),offsiteStatus:process.env.BACKUP_OFFSITE_ENDPOINT?'PENDING':'NOT_CONFIGURED',createdAt:new Date(manifest.createdAt),finishedAt:new Date(manifest.createdAt)}});
  }
}
async function recover() {
  await reconcileBackupCatalog();
  for(const name of await readdir(journal)) {
    if(!/^[0-9a-f-]+\.json$/i.test(name)) continue;
    const task=JSON.parse(await readFile(path.join(journal,name),'utf8'));
    const row=await db.opsTask.findUnique({where:{id:task.id}});
    if(!row || ['PENDING','RUNNING'].includes(row.status)) await record(task,task.state==='DONE'?'DONE':'FAILED',task.result || {reason:'INTERRUPTED'});
  }
}
async function cleanExpired() {
  const expired=await db.backupUpload.findMany({where:{expiresAt:{lt:new Date()},status:{not:'EXPIRED'}}});
  for(const row of expired) {
    if(!uuid.test(row.id)) continue;
    await rm(path.join(uploads,`${row.id}.zip`),{force:true});
    await rm(path.join(root,'validated',row.id),{recursive:true,force:true});
    await db.backupUpload.update({where:{id:row.id},data:{status:'EXPIRED'}});
  }
}
async function prune(settings) {
  const rows=await db.backup.findMany({where:{kind:'scheduled',status:'DONE',localPrunedAt:null}});
  const keep=retainedBackups(rows,settings);
  for(const row of rows) {
    if(keep.has(row.id) || !key.test(row.fileKey)) continue;
    await rm(path.join(root,row.fileKey),{recursive:true,force:true});
    await rm(path.join(root,'exports',`${row.fileKey}.zip`),{force:true});
    await db.backup.update({where:{id:row.id},data:{localPrunedAt:new Date()}});
  }
}
async function schedule() {
  const settings=await db.backupSettings.findUnique({where:{id:'default'}});
  await cleanExpired();
  if(!settings?.enabled) return;
  await prune(settings);
  const now=new Date(); if(!scheduleDue(now,settings)) return;
  const date=now.toISOString().slice(0,10);
  await db.opsTask.upsert({where:{requestKey:`schedule:backup:${date}`},create:{requestKey:`schedule:backup:${date}`,type:'BACKUP',payload:{includeMedia:settings.includeMedia}},update:{}});
  if(now.getUTCDay()===settings.verifyWeekday) {
    const backup=await db.backup.findFirst({where:{status:'DONE'},orderBy:{createdAt:'desc'}});
    if(backup) await db.opsTask.upsert({where:{requestKey:`schedule:verify:${date}`},create:{requestKey:`schedule:verify:${date}`,type:'VERIFY',payload:{backupId:backup.id}},update:{}});
  }
}
await mkdir(journal,{recursive:true,mode:0o700});
await mkdir(path.join(root,'exports'),{recursive:true});
await mkdir(path.join(root,'validated'),{recursive:true,mode:0o700});
let initialized=false;
while(true) {
  try {
    if(!initialized) { await recover(); initialized=true; }
    await schedule();
    const task=await db.opsTask.findFirst({where:{status:'PENDING'},orderBy:{createdAt:'asc'}});
    if(task) await processTask(task);
  } catch { console.error('[ops] operation failed; retrying database connection'); }
  await new Promise(resolve=>setTimeout(resolve,2000));
}
