import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { readEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/database.js';
import { buildApp } from '../src/app.js';
import type { PrivateCredentialStore } from '../src/modules/doctor-registration/contracts.js';

test('explicit hosted test identity configuration fails closed', () => {
  const base = { APP_ENV: 'staging', NODE_ENV: 'production', OTP_MODE: 'testing',
    ADMIN_SECURITY_MODE: 'disabled', SESSION_SECRET: randomBytes(32).toString('hex'), DATABASE_URL: 'postgresql://localhost/test' };
  const list = JSON.stringify({ ['a'.repeat(64)]: 'PATIENT', ['b'.repeat(64)]: 'DOCTOR' });
  assert.equal(readEnvironment({ ...base, OTP_TEST_ACCOUNTS: list }).OTP_TEST_ACCOUNTS, list);
  assert.equal(readEnvironment(base).OTP_TEST_ACCOUNTS, '{}');
  for (const value of ['invalid', '[]', 'null', '{"phone":"DOCTOR"}', JSON.stringify({ ['a'.repeat(64)]: 'ADMIN' }),
    JSON.stringify(Object.fromEntries(Array.from({length:51}, (_, i) => [i.toString(16).padStart(64,'0'), 'PATIENT'])))]) {
    assert.throws(() => readEnvironment({ ...base, OTP_TEST_ACCOUNTS: value }), /OTP_TEST_ACCOUNTS/);
  }
  for (const override of [{ APP_ENV: 'production' }, { OTP_MODE: 'disabled' }, { APP_ENV: 'development', NODE_ENV: 'development' }]) {
    assert.throws(() => readEnvironment({ ...base, ...override, OTP_TEST_ACCOUNTS: list }), /OTP_TEST_ACCOUNTS/);
  }
});

test('explicit staging Patient and Doctor OTP preserve approval, sessions and ownership on PostgreSQL', {
  skip: process.env.AUTH_INTEGRATION !== 'true' || !process.env.DATABASE_URL,
}, async t => {
  const database = createDatabase(process.env.DATABASE_URL!), db = database.client!;
  const env = readEnvironment({ APP_ENV:'staging', NODE_ENV:'production', OTP_MODE:'testing',
    ADMIN_SECURITY_MODE:'disabled', SESSION_SECRET:randomBytes(32).toString('hex'), DATABASE_URL:process.env.DATABASE_URL, LOG_LEVEL:'silent' });
  // Storage contract double only: this suite tests authentication, not Railway storage.
  const objects = new Map<string,Buffer>();
  const store: PrivateCredentialStore = { available:true, async put(k,b){objects.set(k,b);},
    async read(k){const b=objects.get(k);if(!b)throw Error('Missing');return b;}, async remove(k){objects.delete(k);} };
  const dependencies = {store,requiredKinds:['REGISTRATION'] as const};
  const app = await buildApp(env, database, dependencies);
  // Admin uses the existing local authentication mechanism on the isolated test DB.
  // No preview Admin session or hosted Admin bypass is introduced.
  const adminEnv = readEnvironment({ APP_ENV:'test', OTP_MODE:'development', ADMIN_SECURITY_MODE:'development', SESSION_SECRET:env.SESSION_SECRET });
  const adminApp = await buildApp(adminEnv, createDatabase(process.env.DATABASE_URL!), dependencies);
  const phones:string[] = [], accounts:Record<string,string> = {};
  const hash = (p:string) => createHash('sha256').update(p).digest('hex');
  async function fresh(kind?:'PATIENT'|'DOCTOR') {
    let p:string;
    do {p='+919'+randomInt(1e9).toString().padStart(9,'0');} while(phones.includes(p)||await db.user.findUnique({where:{phone:p}}));
    phones.push(p); if(kind) accounts[hash(p)]=kind; env.OTP_TEST_ACCOUNTS=JSON.stringify(accounts); return p;
  }
  let seq=0;
  const call = (path:string, body?:object, token?:string, method:'POST'|'GET'|'PATCH'=body?'POST':'GET', server=app) => server.inject({
    method,url:'/api/v1'+path,remoteAddress:`127.45.${Math.floor(++seq/250)}.${seq%250+1}`,
    ...(body?{payload:body}:{}),headers:token?{authorization:'Bearer '+token}:{} });
  async function otp(p:string, registration=false, doctor=false) {
    const base=registration?'/doctor/registration/otp':'/auth/otp';
    const context=doctor?{context:'DOCTOR'}:{};
    const q=await call(base+'/request',{phone:p,...context});assert.equal(q.statusCode,200);
    assert.equal(q.json().data.delivery,'testing');
    const v=await call(base+'/verify',{challengeId:q.json().data.challengeId,code:q.json().data.developmentCode,...context});
    assert.equal(v.statusCode,200);return v.json().data.token as string;
  }
  const cooldown = (p:string) => db.otpChallenge.update({where:{phone:p},data:{requestedAt:new Date(0),windowStartedAt:new Date(0)}});
  t.after(async()=>{
    const users=await db.user.findMany({where:{phone:{in:phones}},select:{id:true}});
    await db.doctor.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});
    await db.user.deleteMany({where:{phone:{in:phones}}});
    await db.otpChallenge.deleteMany({where:{phone:{in:phones}}});
    await adminApp.close();await app.close();
  });
  const patientPhone=await fresh('PATIENT'), doctorPhone=await fresh('DOCTOR'), otherPhone=await fresh('DOCTOR');
  let patient='',doctor='',other='',doctorId='';
  await t.test('unlisted phones cannot receive OTP or create accounts',async()=>{
    const p=await fresh();
    for(const [path,body] of [['/auth/otp/request',{phone:p}],['/auth/otp/request',{phone:p,context:'DOCTOR'}],['/doctor/registration/otp/request',{phone:p}]] as const) {
      const r=await call(path,body);assert.equal(r.statusCode,403);assert.equal(r.json().error.code,'TEST_LOGIN_NOT_ALLOWED');
    }
    assert.equal(await db.otpChallenge.count({where:{phone:p}}),0);assert.equal(await db.user.count({where:{phone:p}}),0);
  });
  await t.test('Patient session accesses Patient APIs but cannot get Doctor or Admin access',async()=>{
    patient=await otp(patientPhone);
    assert.equal((await call('/auth/session',undefined,patient)).statusCode,200);
    for(const path of ['/doctor/appointments','/admin/operations/dashboard'])assert.equal((await call(path,undefined,patient)).statusCode,403);
    for(const path of ['/auth/otp/request','/doctor/registration/otp/request'])assert.equal((await call(path,{phone:patientPhone,context:'DOCTOR'})).statusCode>=400,true);
  });
  await t.test('Doctor registration creates only a pending DOCTOR; supplied roles/status cannot grant access',async()=>{
    const unknown=await call('/auth/otp/request',{phone:doctorPhone,context:'DOCTOR'});
    assert.equal(unknown.statusCode,409);assert.equal(unknown.json().error.code,'DOCTOR_REGISTRATION_REQUIRED');
    assert.equal(await db.user.count({where:{phone:doctorPhone}}),0);
    assert.equal(await db.otpChallenge.count({where:{phone:doctorPhone}}),0);
    assert.equal((await call('/doctor/registration/otp/request',{phone:doctorPhone,role:'ADMIN',verificationStatus:'VERIFIED'})).statusCode,400);
    doctor=await otp(doctorPhone,true);other=await otp(otherPhone,true);
    const user=await db.user.findUniqueOrThrow({where:{phone:doctorPhone},include:{roles:true,doctorProfile:true}});
    assert.deepEqual(user.roles.map(r=>r.role),['DOCTOR']);doctorId=user.doctorProfile!.id;
    assert.equal(user.doctorProfile!.verificationStatus,'PENDING_VERIFICATION');
    assert.equal((await call('/doctor/appointments',undefined,doctor)).statusCode,403);
    assert.equal((await call('/auth/otp/request',{phone:doctorPhone,context:'DOCTOR'})).statusCode,403);
    assert.equal((await call('/auth/otp/request',{phone:doctorPhone})).statusCode,403);
  });
  const profile={name:'SYNTHETIC Hosted Applicant',registrationEmail:'hosted@example.invalid',registrationDateOfBirth:'',registrationGender:'',
    qualification:'SYNTHETIC qualification',specialty:'SYNTHETIC education',biography:'Synthetic test application.',
    registrationAuthority:'SYNTHETIC council',registrationNumber:'SYNTHETIC-HOSTED',experienceYears:2,languages:['English'],feePaise:10000};
  const review=()=>'/admin/operations/doctors/'+doctorId+'/registration/review';
  let admin='';
  await t.test('credentials remain owner scoped and submission still requires Admin approval',async()=>{
    assert.equal((await call('/doctor/registration',profile,doctor,'PATCH')).statusCode,200);
    assert.equal((await call('/doctor/registration/submit',{},doctor)).statusCode,400);
    const upload=await call('/doctor/registration/documents',{kind:'REGISTRATION',fileName:'synthetic.pdf',contentType:'application/pdf',contentBase64:Buffer.from('%PDF-1.7 synthetic fixture').toString('base64')},doctor);
    assert.equal(upload.statusCode,200);const id=upload.json().data.documents[0].id;
    assert.equal((await call('/doctor/registration/documents/'+id,undefined,other)).statusCode,404);
    assert.equal((await call('/doctor/registration/documents/'+id,undefined,patient)).statusCode,403);
    assert.equal((await call('/doctor/registration/submit',{},doctor)).json().data.status,'SUBMITTED');
    assert.equal((await call('/doctor/appointments',undefined,doctor)).statusCode,403);
    assert.equal((await call(review(),{action:'APPROVE'})).statusCode,401);
    for(const token of [patient,doctor])assert.equal((await call(review(),{action:'APPROVE'},token)).statusCode,403);
    const p=await fresh();await db.user.create({data:{phone:p,roles:{create:{role:'ADMIN'}}}});
    const q=await call('/auth/otp/request',{phone:p},undefined,'POST',adminApp);
    const v=await call('/auth/otp/verify',{challengeId:q.json().data.challengeId,code:q.json().data.developmentCode},undefined,'POST',adminApp);
    assert.equal(v.statusCode,200);admin=v.json().data.token;
    assert.equal((await call(review(),{action:'REJECT',reason:'Synthetic correction required'},admin,'POST',adminApp)).json().data.status,'REJECTED');
    assert.equal((await call('/auth/otp/request',{phone:doctorPhone,context:'DOCTOR'})).statusCode,403);
    assert.equal((await call('/doctor/appointments',undefined,doctor)).statusCode,403);
  });
  await t.test('rejected applicant recovers without duplicates, corrects and receives authorized Admin approval',async()=>{
    await cooldown(doctorPhone);doctor=await otp(doctorPhone,true);
    assert.equal((await call('/doctor/registration',undefined,doctor)).json().data.status,'REJECTED');
    assert.equal((await call('/doctor/registration',profile,doctor,'PATCH')).statusCode,200);
    assert.equal((await call('/doctor/registration/submit',{},doctor)).statusCode,200);
    assert.equal((await call(review(),{action:'APPROVE'},admin,'POST',adminApp)).json().data.status,'VERIFIED');
    assert.equal((await call('/doctor/session',undefined,doctor)).json().data.status,'READY');
    assert.equal(await db.doctor.count({where:{user:{phone:doctorPhone}}}),1);
  });
  await t.test('verified Doctor signs in, restores Home, cannot cross OTP purposes, and logs out',async()=>{
    await cooldown(doctorPhone);doctor=await otp(doctorPhone,false,true);
    assert.equal((await call('/doctor/session',undefined,doctor)).json().data.status,'READY');
    assert.equal((await call('/doctor/appointments',undefined,doctor)).statusCode,200);
    assert.equal((await call('/admin/operations/dashboard',undefined,doctor)).statusCode,403);
    await cooldown(doctorPhone);
    const q=await call('/auth/otp/request',{phone:doctorPhone,context:'DOCTOR'});
    const body={challengeId:q.json().data.challengeId,code:q.json().data.developmentCode};
    assert.equal((await call('/auth/otp/verify',body)).statusCode,400);
    assert.equal((await call('/doctor/registration/otp/verify',body)).statusCode,400);
    assert.equal((await call('/auth/otp/verify',{...body,context:'DOCTOR'})).statusCode,200);
    assert.equal((await call('/auth/logout',{},doctor)).statusCode,200);
    assert.equal((await call('/doctor/session',undefined,doctor)).statusCode,401);
    await cooldown(doctorPhone);doctor=await otp(doctorPhone,false,true);
  });
  await t.test('readiness, revocation, suspension and account changes are rechecked server-side',async()=>{
    await db.doctor.update({where:{id:doctorId},data:{biography:''}});
    assert.equal((await call('/auth/otp/request',{phone:doctorPhone,context:'DOCTOR'})).statusCode,403);
    await db.doctor.update({where:{id:doctorId},data:{biography:profile.biography}});
    delete accounts[hash(doctorPhone)];env.OTP_TEST_ACCOUNTS=JSON.stringify(accounts);
    assert.equal((await call('/doctor/session',undefined,doctor)).statusCode,401);
    accounts[hash(doctorPhone)]='DOCTOR';env.OTP_TEST_ACCOUNTS=JSON.stringify(accounts);
    await cooldown(doctorPhone);
    const q=await call('/auth/otp/request',{phone:doctorPhone,context:'DOCTOR'});assert.equal(q.statusCode,200);
    assert.equal((await call(review(),{action:'SUSPEND'},admin,'POST',adminApp)).statusCode,200);
    assert.equal((await call('/auth/otp/verify',{challengeId:q.json().data.challengeId,code:q.json().data.developmentCode,context:'DOCTOR'})).statusCode,400);
    assert.equal((await call('/doctor/session',undefined,doctor)).statusCode,401);
    assert.equal((await call('/doctor/registration/otp/request',{phone:doctorPhone})).statusCode,403);
    accounts[hash(patientPhone)]='DOCTOR';env.OTP_TEST_ACCOUNTS=JSON.stringify(accounts);
    assert.equal((await call('/doctor/registration/otp/request',{phone:patientPhone})).statusCode,403);
    assert.equal((await call('/auth/session',undefined,patient)).statusCode,401);
    const user=await db.user.findUniqueOrThrow({where:{phone:patientPhone},include:{roles:true}});assert.deepEqual(user.roles.map(r=>r.role),['USER']);
  });
});
