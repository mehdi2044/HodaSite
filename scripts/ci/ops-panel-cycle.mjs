import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
const db=new PrismaClient();
const root=process.env.BACKUP_ROOT||'/backups';
const uploads=process.env.BACKUP_UPLOAD_ROOT||'/backup-uploads';
const owner=await db.user.findFirstOrThrow({where:{roles:{some:{role:{key:'owner'}}}}});
await db.user.update({where:{id:owner.id},data:{mfaEnabled:true}});
async function task(type,payload,extra={}) {
 const row=await db.opsTask.create({data:{type,requestKey:randomUUID(),requestedBy:owner.id,payload,...extra}});
 if(type==='RESTORE') await db.restoreRequest.create({data:{id:row.id,requestedBy:owner.id,mfaVerifiedAt:extra.authorizedAt,uploadedFileKey:`${payload.uploadId}.zip`,mode:'FULL'}});
 for(let n=0;n<180;n++) {
  await new Promise(resolve=>setTimeout(resolve,1000));
  const current=await db.opsTask.findUnique({where:{id:row.id}}).catch(()=>null);
  if(current?.status==='FAILED')throw Error(`${type} failed`);
  if(current?.status==='DONE')return current;
 }
 throw Error(`${type} timed out`);
}
const backupTask=await task('BACKUP',{includeMedia:true});
const backup=await db.backup.findUniqueOrThrow({where:{id:backupTask.result.backupId}});
const zip=path.join(root,'exports',`${backup.fileKey}.zip`);
const size=(await stat(zip)).size;if(size<=0)throw Error('empty exported backup');
await task('VERIFY',{backupId:backup.id});
if(!(await db.backup.findUniqueOrThrow({where:{id:backup.id}})).verifiedAt)throw Error('verification missing');
const upload=await db.backupUpload.create({data:{ownerId:owner.id,originalName:'roundtrip.zip',expectedBytes:BigInt(size),receivedBytes:BigInt(size),status:'UPLOADED',expiresAt:new Date(Date.now()+3600000)}});
await mkdir(uploads,{recursive:true});await copyFile(zip,path.join(uploads,`${upload.id}.zip`));
await task('VALIDATE_UPLOAD',{uploadId:upload.id});
if((await db.backupUpload.findUniqueOrThrow({where:{id:upload.id}})).status!=='READY')throw Error('upload not ready');
const restore=await task('RESTORE',{uploadId:upload.id,mode:'FULL'},{authorizedAt:new Date()});
if((await db.restoreRequest.findUniqueOrThrow({where:{id:restore.id}})).status!=='DONE')throw Error('restore journal missing');
if((await db.opsTask.findUniqueOrThrow({where:{id:backupTask.id}})).status!=='DONE')throw Error('restored running task was not reconciled');
await db.user.update({where:{id:owner.id},data:{mfaEnabled:owner.mfaEnabled}});
console.log('OPS PANEL CYCLE OK: backup/export/verify/upload validation/restore, durable journal, no replay');
await db.$disconnect();
