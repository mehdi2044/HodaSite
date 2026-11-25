import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({principal:null as null|{user:{id:string};adminSessionId:string;sessionVersion:number}}));
// Only JWT transport is a boundary stub. Persisted session, MFA eligibility,
// version/revocation and the real finance permission evaluator stay real.
vi.mock('next-auth',()=>({default:()=>({auth:async()=>state.principal,handlers:{},signIn:vi.fn(),signOut:vi.fn()})}));
vi.mock('@/lib/db',async original=>{const module=await original<typeof import('@/lib/db')>();const {traceDatabase}=await import('../helpers/database-timeline');return {...module,db:traceDatabase(module.db)}});
import {db} from '@/lib/db';
import {seal} from '@/lib/secure-tokens';
import {auth,getAdminSession} from '@/modules/auth';
import {financeActor} from '@/modules/finance/operations';
import {UnauthorizedError} from '@/modules/access';
import {transactionWave} from '../helpers/database-timeline';
import {FixtureLifecycle} from '../helpers/fixture-lifecycle';
const lifecycle=new FixtureLifecycle();
let userId='',sessionId='',marketId='';
describe.skipIf(!process.env.TEST_DATABASE_URL)('transaction-local persisted administrator session validation',()=>{
 beforeAll(async()=>{
  const role=await db.role.findUniqueOrThrow({where:{key:'owner'}});
  const user=await db.user.create({data:{email:'session-reader-'+randomUUID()+'@example.test',name:'Session reader fixture',passwordHash:'unused',mfaEnabled:true,mfaSecret:seal('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'),roles:{create:{roleId:role.id}}}});
  userId=user.id;marketId=(await db.market.findUniqueOrThrow({where:{code:'TR'}})).id;
  sessionId=(await db.adminSession.create({data:{userId,sessionVersion:0,mfaVerifiedAt:new Date(),expiresAt:new Date('2099-01-01')}})).id;
 });
 beforeEach(async()=>{await lifecycle.ready();state.principal={user:{id:userId},adminSessionId:sessionId,sessionVersion:0}});
 afterEach(()=>lifecycle.ready());
 afterAll(async()=>{await lifecycle.ready();await db.$disconnect()});
 it('five admitted finance guards validate real sessions and permissions without another connection',lifecycle.track(async()=>{
  const results=await transactionWave(5,()=>Promise.allSettled(Array.from({length:5},()=>db.$transaction(tx=>financeActor(tx,'finance.report.view',marketId)))));
  expect(results.map(r=>r.status)).toEqual(Array(5).fill('fulfilled'));
  for(const r of results){if(r.status!=='fulfilled')throw r.reason;expect(r.value).toBe(userId)}
 }));
 it('the actual finance guard sees transaction-local session revocation and rolls it back',lifecycle.track(async()=>{
  try{
   await expect(db.$transaction(async tx=>{
    await tx.adminSession.update({where:{id:sessionId},data:{revokedAt:new Date()}});
    return financeActor(tx,'finance.report.view',marketId);
   })).rejects.toBeInstanceOf(UnauthorizedError);
   expect((await db.adminSession.findUniqueOrThrow({where:{id:sessionId}})).revokedAt).toBeNull();
  }finally{
   // Restore only this newly created synthetic session if the red control
   // commits; never change an existing administrator or session.
   await db.adminSession.update({where:{id:sessionId},data:{revokedAt:null}});
  }
 }));
 it('enrollment-only sessions cannot authorize finance but remain usable for setup',lifecycle.track(async()=>{
  const enrollment=await db.adminSession.create({data:{userId,sessionVersion:0,enrollmentOnly:true,expiresAt:new Date('2099-01-01')}});
  state.principal={user:{id:userId},adminSessionId:enrollment.id,sessionVersion:0};
  await expect(db.$transaction(tx=>financeActor(tx,'finance.report.view',marketId))).rejects.toBeInstanceOf(UnauthorizedError);
  const setup=await db.$transaction(tx=>getAdminSession(true,tx));
  expect(setup?.enrollmentOnly).toBe(true);
 }));
 it('a missing signed principal remains denied',lifecycle.track(async()=>{
  state.principal=null;
  await expect(db.$transaction(tx=>financeActor(tx,'finance.report.view',marketId))).rejects.toBeInstanceOf(UnauthorizedError);
  expect(await auth()).toBeNull();
 }));
});
