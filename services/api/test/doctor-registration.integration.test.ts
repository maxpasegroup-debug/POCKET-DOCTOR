import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/database/database.js';
import { configuredRegistration } from '../src/modules/doctor-registration/local-store.js';
import { readEnvironment } from '../src/config/env.js';
import { documentBytes, type PrivateCredentialStore } from '../src/modules/doctor-registration/contracts.js';

test('credential file signatures, size, and photo types are validated',()=>{
  const maximum=Buffer.alloc(5*1024*1024);maximum.write('%PDF-');
  assert.equal(documentBytes({kind:'REGISTRATION',fileName:'maximum.pdf',contentType:'application/pdf',contentBase64:maximum.toString('base64')}).length,maximum.length);
  const oversized=Buffer.alloc(5*1024*1024+1);oversized.write('%PDF-');
  assert.throws(()=>documentBytes({kind:'REGISTRATION',fileName:'oversized.pdf',contentType:'application/pdf',contentBase64:oversized.toString('base64')}));
  assert.equal(documentBytes({kind:'REGISTRATION',fileName:'valid.pdf',contentType:'application/pdf',contentBase64:Buffer.from('%PDF-1.7').toString('base64')}).length,8);
  assert.throws(()=>documentBytes({kind:'REGISTRATION',fileName:'x.pdf',contentType:'application/pdf',contentBase64:Buffer.from('not pdf').toString('base64')}));
  assert.throws(()=>documentBytes({kind:'PROFILE_PHOTO',fileName:'x.pdf',contentType:'application/pdf',contentBase64:Buffer.from('%PDF-1.7').toString('base64')}));
  assert.throws(()=>documentBytes({kind:'REGISTRATION',fileName:'x.pdf',contentType:'application/pdf',contentBase64:'not base64'}));
});

test('doctor registration, approval, rejection, ownership and suspension on PostgreSQL',{skip:process.env.AUTH_INTEGRATION!=='true'||!process.env.DATABASE_URL},async t=>{
  const database=createDatabase(process.env.DATABASE_URL!),db=database.client!;
  const env=readEnvironment({APP_ENV:'test',OTP_MODE:'development',SESSION_SECRET:randomBytes(32).toString('hex'),ADMIN_SECURITY_MODE:'development'});
  // Private storage contract test double only; not evidence of configured live storage.
  const objects=new Map<string,Buffer>();const store:PrivateCredentialStore={available:true,async put(k,b){objects.set(k,b);},async read(k){const b=objects.get(k);if(!b)throw Error('Missing');return b;},async remove(k){objects.delete(k);}};
  const app=await buildApp(env,database,{store,requiredKinds:['REGISTRATION']});const users:string[]=[],phones:string[]=[];let seq=0;
  const call=(path:string,method:'GET'|'POST'|'PATCH'|'DELETE'='GET',body?:unknown,token?:string)=>app.inject({method,url:'/api/v1'+path,remoteAddress:`127.21.${Math.floor(++seq/250)}.${seq%250+1}`,headers:token?{authorization:`Bearer ${token}`}:{},...(body===undefined?{}:{payload:body as object})});
  const phone=()=>{const p='+919'+String(BigInt('0x'+randomBytes(6).toString('hex'))%1000000000n).padStart(9,'0');phones.push(p);return p;};
  async function login(role:'USER'|'ADMIN') {const p=phone();const u=await db.user.create({data:{phone:p,roles:{create:{role}}}});users.push(u.id);const q=await call('/auth/otp/request','POST',{phone:p});const v=await call('/auth/otp/verify','POST',{challengeId:q.json().data.challengeId,code:q.json().data.developmentCode});assert.equal(v.statusCode,200);return {id:u.id,phone:p,token:v.json().data.token as string};}
  async function register(){const p=phone();const q=await call('/doctor/registration/otp/request','POST',{phone:p});assert.equal(q.statusCode,200);const body={challengeId:q.json().data.challengeId,code:q.json().data.developmentCode};
    assert.equal((await call('/auth/otp/verify','POST',body)).statusCode,400);
    const v=await call('/doctor/registration/otp/verify','POST',body);assert.equal(v.statusCode,200);assert.deepEqual(v.json().data.user.roles,['DOCTOR']);users.push(v.json().data.user.id);
    const token=v.json().data.token as string;const state=await call('/doctor/registration','GET',undefined,token);assert.equal(state.statusCode,200);assert.equal(state.json().data.status,'DRAFT');return {token,id:state.json().data.id as string,userId:v.json().data.user.id as string};}
  t.after(async()=>{await db.doctor.deleteMany({where:{userId:{in:users}}});await db.user.deleteMany({where:{id:{in:users}}});await db.otpChallenge.deleteMany({where:{phone:{in:phones}}});await app.close();});
  const patient=await login('USER'),admin=await login('ADMIN'),a=await register(),b=await register();
  const profile={name:'SYNTHETIC registration doctor',registrationEmail:'doctor@example.invalid',registrationDateOfBirth:'1990-01-01',registrationGender:'PREFER_NOT_TO_SAY' as const,qualification:'SYNTHETIC qualification',specialty:'SYNTHETIC education',biography:'Synthetic professional application used only for tests.',registrationAuthority:'SYNTHETIC council',registrationNumber:'SYNTHETIC-123',experienceYears:4,languages:['English'],feePaise:10000};
  const doc={kind:'REGISTRATION',fileName:'synthetic.pdf',contentType:'application/pdf',contentBase64:Buffer.from('%PDF-1.7 synthetic contract-test bytes').toString('base64')};
  let documentId='';
  async function assertAdminCannotEdit(doctorId:string) {
    const before=await db.doctor.findUniqueOrThrow({where:{id:doctorId},include:{availability:true,exceptions:true,credentials:true}});
    const path=`/admin/operations/doctors/${doctorId}`;
    const payload={name:'Unauthorized admin rewrite',qualification:'Changed qualification',specialty:'Changed specialty',biography:'Changed biography',experienceYears:1,languages:['Hindi'],feePaise:1,acceptingAppointments:true,verificationStatus:before.verificationStatus,registrationAuthority:'Changed council',registrationNumber:'Changed registration'};
    for(const [method,url,body] of [['PATCH',path,payload],['PATCH',path,{...payload,verificationStatus:'VERIFIED'}],['POST',path+'/availability',{timezone:'Asia/Kolkata',consultationMinutes:20,bufferMinutes:5,acceptingAppointments:false,windows:[],excludedDates:[]}]] as const){
      const response=await call(url,method,body,admin.token);
      assert.equal(response.statusCode,403);assert.equal(response.json().error.code,'DOCTOR_DETAILS_READ_ONLY');
    }
    assert.deepEqual(await db.doctor.findUniqueOrThrow({where:{id:doctorId},include:{availability:true,exceptions:true,credentials:true}}),before);
    assert.equal((await call(path,'GET',undefined,admin.token)).statusCode,200);
  }
  await t.test('Admin can read but cannot rewrite a new Doctor draft or schedule',async()=>{
    await assertAdminCannotEdit(a.id);
    for(const token of [patient.token,a.token])assert.equal((await call(`/admin/operations/doctors/${a.id}`,'PATCH',{name:'Changed'},token)).statusCode,403);
    assert.equal((await call(`/admin/operations/doctors/${a.id}`,'PATCH',{name:'Changed'})).statusCode,401);
  });
  await t.test('legacy Doctor profiles without registration dates are also read-only for Admin',async()=>{
    const legacy=await register();
    await db.doctor.update({where:{id:legacy.id},data:{registrationStartedAt:null}});
    await assertAdminCannotEdit(legacy.id);
  });
  await t.test('development document deferral still requires complete profile and Admin approval',async()=>{
    const deferredEnv=readEnvironment({APP_ENV:'test',OTP_MODE:'development',SESSION_SECRET:env.SESSION_SECRET,ADMIN_SECURITY_MODE:'development',DOCTOR_REGISTRATION_DEFER_DOCUMENTS:'true'});
    const deferred=await buildApp(deferredEnv,createDatabase(process.env.DATABASE_URL!),configuredRegistration(deferredEnv));
    const c=await register();
    const request=(url:string,method:'GET'|'POST'|'PATCH',body:object|undefined,token:string)=>deferred.inject({method,url:'/api/v1'+url,headers:{authorization:'Bearer '+token},...(body?{payload:body}:{})});
    try {
      assert.equal((await request('/doctor/registration','GET',undefined,c.token)).json().data.documentPolicy.deferred,true);
      assert.equal((await request('/doctor/registration/submit','POST',{},c.token)).statusCode,400);
      assert.equal((await request('/doctor/registration','PATCH',profile,c.token)).statusCode,200);
      const submitted=await request('/doctor/registration/submit','POST',{},c.token);
      assert.equal(submitted.statusCode,200);assert.equal(submitted.json().data.status,'SUBMITTED');
      assert.equal(await db.doctorCredential.count({where:{doctorId:c.id}}),0);
      assert.equal((await request('/doctor/appointments','GET',undefined,c.token)).statusCode,403);
      const review='/admin/operations/doctors/'+c.id+'/registration/review';
      assert.equal((await request(review,'POST',{action:'APPROVE'},c.token)).statusCode,403);
      assert.equal((await request(review,'POST',{action:'APPROVE'},patient.token)).statusCode,403);
      assert.equal((await request(review,'POST',{action:'APPROVE'},admin.token)).json().data.status,'VERIFIED');
      assert.equal((await request('/doctor/appointments','GET',undefined,c.token)).statusCode,200);
      assert.equal((await request('/doctor/appointments','GET',undefined,patient.token)).statusCode,403);
      assert.equal((await request(review,'POST',{action:'SUSPEND'},admin.token)).json().data.status,'SUSPENDED');
      assert.equal((await request('/doctor/appointments','GET',undefined,c.token)).statusCode,403);
    } finally {await deferred.close();}
  });

  await t.test('ordinary Patient cannot promote, write application, upload, or use operational APIs',async()=>{
    assert.equal((await call('/doctor/registration/otp/request','POST',{phone:patient.phone})).statusCode,403);
    assert.equal((await call('/doctor/registration/otp/request','POST',{phone:phone(),role:'DOCTOR'})).statusCode,400);
    for(const [method,path,body] of [['GET','/doctor/registration',undefined],['PATCH','/doctor/registration',profile],['POST','/doctor/registration/documents',doc],['GET','/doctor/appointments',undefined]] as const)assert.equal((await call(path,method,body,patient.token)).statusCode,403);
    assert.equal((await call('/doctor/appointments','GET',undefined,a.token)).statusCode,403);
  });
  await t.test('registration purpose shares rate limits and does not promote a racing USER',async()=>{
    const p=phone(),q=await call('/doctor/registration/otp/request','POST',{phone:p});assert.equal(q.statusCode,200);
    assert.equal((await call('/auth/otp/request','POST',{phone:p})).statusCode,429);
    const u=await db.user.create({data:{phone:p,roles:{create:{role:'USER'}}}});users.push(u.id);
    assert.equal((await call('/doctor/registration/otp/verify','POST',{challengeId:q.json().data.challengeId,code:q.json().data.developmentCode})).statusCode,400);
    assert.equal(await db.userRole.count({where:{userId:u.id,role:'DOCTOR'}}),0);
  });
  await t.test('draft persistence, strict ownership input, and required credentials',async()=>{
    assert.equal((await call('/doctor/registration','PATCH',{...profile,doctorId:b.id},a.token)).statusCode,400);
    assert.equal((await call('/doctor/registration','PATCH',profile,a.token)).statusCode,200);
    assert.equal((await call('/doctor/registration','GET',undefined,a.token)).json().data.profile.name,profile.name);
    assert.equal((await call('/doctor/registration/submit','POST',{},a.token)).statusCode,400);
    const response=await call('/doctor/registration/documents','POST',doc,a.token);assert.equal(response.statusCode,200);documentId=response.json().data.documents[0].id;
    assert.ok(!JSON.stringify(response.json()).includes('objectKey'));assert.ok(!JSON.stringify(response.json()).includes('contentBase64'));
  });
  await t.test('private documents require matching Doctor owner or authorized Admin',async()=>{
    assert.equal((await call(`/doctor/registration/documents/${documentId}`,'GET',undefined,b.token)).statusCode,404);
    assert.equal((await call(`/doctor/registration/documents/${documentId}`,'GET',undefined,patient.token)).statusCode,403);
    assert.equal((await call(`/doctor/registration/documents/${documentId}`,'GET',undefined,a.token)).statusCode,200);
    assert.equal((await call(`/admin/operations/doctors/${a.id}/registration/documents/${documentId}`,'GET',undefined,a.token)).statusCode,403);
    assert.equal((await call(`/admin/operations/doctors/${a.id}/registration/documents/${documentId}`,'GET',undefined,admin.token)).statusCode,200);
  });
  await t.test('credential replacement is owner-scoped, atomic and exposes only the current record',async()=>{
    assert.equal((await call('/doctor/registration/documents','POST',{...doc,replaceDocumentId:documentId},b.token)).statusCode,404);
    assert.equal((await call('/doctor/registration/documents','POST',{...doc,ownerId:b.id},a.token)).statusCode,400);
    assert.equal((await call('/doctor/registration/documents/'+documentId,'GET')).statusCode,401);
    const oldId=documentId;
    const replaced=await call('/doctor/registration/documents','POST',{...doc,fileName:'corrected.pdf',replaceDocumentId:oldId},a.token);
    assert.equal(replaced.statusCode,200);assert.equal(replaced.json().data.documents.length,1);
    documentId=replaced.json().data.documents[0].id;assert.notEqual(documentId,oldId);
    assert.equal((await call('/doctor/registration/documents/'+oldId,'GET',undefined,a.token)).statusCode,404);
    assert.equal((await call('/doctor/registration/documents/'+documentId,'GET',undefined,a.token)).statusCode,200);
  });
  await t.test('submit locks draft and does not grant operational access; Admin review/rejection',async()=>{
    const submit=await call('/doctor/registration/submit','POST',{},a.token);assert.equal(submit.statusCode,200);assert.equal(submit.json().data.status,'SUBMITTED');
    await assertAdminCannotEdit(a.id);
    assert.equal((await call('/doctor/registration','PATCH',profile,a.token)).statusCode,409);
    assert.equal((await call('/doctor/appointments','GET',undefined,a.token)).statusCode,403);
    assert.equal((await call(`/admin/operations/doctors/${a.id}/registration/review`,'POST',{action:'APPROVE'},a.token)).statusCode,403);
    assert.equal((await call(`/admin/operations/doctors/${a.id}/registration/review`,'POST',{action:'BEGIN_REVIEW'},admin.token)).json().data.status,'UNDER_REVIEW');
    await assertAdminCannotEdit(a.id);
    assert.equal((await call(`/admin/operations/doctors/${a.id}/registration/review`,'POST',{action:'REJECT'},admin.token)).statusCode,400);
    const rejected=await call(`/admin/operations/doctors/${a.id}/registration/review`,'POST',{action:'REJECT',reason:'Replace the synthetic registration certificate.'},admin.token);assert.equal(rejected.statusCode,200);assert.equal(rejected.json().data.status,'REJECTED');
    await assertAdminCannotEdit(a.id);
    assert.equal((await call('/doctor/appointments','GET',undefined,a.token)).statusCode,403);
  });
  await t.test('correction/resubmission then approval grants existing Doctor services',async()=>{
    assert.equal((await call('/doctor/registration','PATCH',{...profile,qualification:'Corrected synthetic qualification'},a.token)).statusCode,200);
    assert.equal((await call('/doctor/registration/submit','POST',{},a.token)).statusCode,200);
    const approved=await call(`/admin/operations/doctors/${a.id}/registration/review`,'POST',{action:'APPROVE'},admin.token);assert.equal(approved.statusCode,200);assert.equal(approved.json().data.status,'VERIFIED');
    await assertAdminCannotEdit(a.id);
    const session=await call('/doctor/session','GET',undefined,a.token);assert.equal(session.json().data.status,'READY');
    assert.equal((await call('/doctor/appointments','GET',undefined,a.token)).statusCode,200);
    assert.equal((await call('/doctor/registration','PATCH',profile,a.token)).statusCode,409);
    assert.equal((await call('/doctor/registration/documents','POST',doc,a.token)).statusCode,409);
  });
  await t.test('suspension denies the existing session on the next operational request',async()=>{
    assert.equal((await call(`/admin/operations/doctors/${a.id}/registration/review`,'POST',{action:'SUSPEND'},admin.token)).statusCode,200);
    await assertAdminCannotEdit(a.id);
    assert.equal((await call('/doctor/appointments','GET',undefined,a.token)).statusCode,403);
    assert.equal((await call(`/doctor/registration/documents/${documentId}`,'GET',undefined,a.token)).statusCode,403);
  });
  await t.test('legacy Admin PATCH cannot bypass application approval or rejection rules',async()=>{
    const payload={name:profile.name,qualification:profile.qualification,specialty:profile.specialty,biography:profile.biography,experienceYears:4,languages:['English'],feePaise:10000,acceptingAppointments:true,verificationStatus:'VERIFIED',registrationAuthority:profile.registrationAuthority,registrationNumber:profile.registrationNumber};
    const response=await call(`/admin/operations/doctors/${b.id}`,'PATCH',payload,admin.token);
    assert.equal(response.statusCode,403);assert.equal(response.json().error.code,'DOCTOR_DETAILS_READ_ONLY');
  });
  await t.test('unconfigured private storage fails closed without metadata or privilege grant',async()=>{
    const {RegistrationService}=await import('../src/modules/doctor-registration/service.js');const svc=new RegistrationService(db);
    await svc.save(b.userId,profile);
    await assert.rejects(()=>svc.upload(b.userId,doc as Parameters<typeof svc.upload>[1]),/Secure document storage/);
    await assert.rejects(()=>svc.submit(b.userId),/Secure document storage/);
    assert.equal(await db.doctorCredential.count({where:{doctorId:b.id}}),0);
    assert.equal((await db.doctor.findUniqueOrThrow({where:{id:b.id}})).verificationStatus,'PENDING_VERIFICATION');
  });
});

test('document deferral defaults off and is rejected in deployments',()=>{
  assert.equal(configuredRegistration(readEnvironment({APP_ENV:'test'})).deferDocuments ?? false,false);
  for(const APP_ENV of ['staging','production']) assert.throws(()=>readEnvironment({APP_ENV,DOCTOR_REGISTRATION_DEFER_DOCUMENTS:'true'}));
  assert.throws(()=>readEnvironment({APP_ENV:'development',NODE_ENV:'production',DOCTOR_REGISTRATION_DEFER_DOCUMENTS:'true'}));
});
