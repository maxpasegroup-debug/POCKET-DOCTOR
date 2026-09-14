import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LocalCredentialStore, configuredRegistration } from '../src/modules/doctor-registration/local-store.js';
import { readEnvironment } from '../src/config/env.js';
const exec=promisify(execFile);
async function root(t: {after: (fn:()=>Promise<void>)=>void}) {
  const directory=await mkdtemp(path.join(tmpdir(),'pd-credential-test-'));
  if(process.platform==='win32') {
    const script="$ErrorActionPreference='Stop';$p=$env:PD_CREDENTIAL_ROOT;$me=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($me);$a.SetAccessRuleProtection($true,$false);$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($me,'FullControl','ContainerInherit,ObjectInherit','None','Allow'));Set-Acl -LiteralPath $p -AclObject $a";
    await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,env:{...process.env,PD_CREDENTIAL_ROOT:directory}});
  }
  // Only this uniquely-created disposable directory is removed.
  t.after(()=>rm(directory,{recursive:true,force:true}));return directory;
}
const key=()=> 'doctor-credentials/'+randomUUID()+'/'+randomUUID();
test('private local storage persists encrypted bytes across instances and rejects tampering',async t=>{
  const dir=await root(t),secret=randomBytes(32),id=key(),bytes=Buffer.from('%PDF-1.7 SYNTHETIC TEST DOCUMENT');let scans=0;
  // Scanner contract double only. Real OS scanner availability is separately recorded.
  const store=new LocalCredentialStore(dir,secret,async file=>{assert.deepEqual(await readFile(file),bytes);scans++;});
  await store.put(id,bytes,'application/pdf');assert.equal(scans,1);
  const names=await readdir(dir);assert.equal(names.length,1);assert.ok(names[0]!.endsWith('.enc'));
  const file=path.join(dir,names[0]!);const encrypted=await readFile(file);assert.equal(encrypted.includes(bytes),false);
  assert.deepEqual(await new LocalCredentialStore(dir,secret,async()=>{}).read(id),bytes);
  encrypted[encrypted.length-1]=encrypted[encrypted.length-1]!^1;await writeFile(file,encrypted);
  await assert.rejects(()=>store.read(id));await store.remove(id);assert.deepEqual(await readdir(dir),[]);
});
test('scanner failure or file alteration cannot create a successful stored credential',async t=>{
  const dir=await root(t),bytes=Buffer.from('%PDF-1.7 SYNTHETIC');
  for(const scan of [async()=>{throw Error('scanner unavailable');},async(file:string)=>{await writeFile(file,'altered');}]){
    await assert.rejects(()=>new LocalCredentialStore(dir,randomBytes(32),scan).put(key(),bytes,'application/pdf'));
    assert.deepEqual(await readdir(dir),[]);
  }
});
test('client-like path traversal and malformed keys never reach disk',async t=>{
  const dir=await root(t),store=new LocalCredentialStore(dir,randomBytes(32),async()=>{});
  for(const id of ['../secret','/public/document','doctor-credentials/../../secret']) {
    await assert.rejects(()=>store.put(id,Buffer.from('x'),'application/pdf'));
    await assert.rejects(()=>store.read(id));await assert.rejects(()=>store.remove(id));
  }assert.deepEqual(await readdir(dir),[]);
});
test('wrong encryption key cannot read an existing credential and duplicate keys cannot overwrite',async t=>{
  const dir=await root(t),id=key(),secret=randomBytes(32),store=new LocalCredentialStore(dir,secret,async()=>{});
  await store.put(id,Buffer.from('original'),'application/pdf');
  await assert.rejects(()=>store.put(id,Buffer.from('replacement'),'application/pdf'));
  assert.equal((await store.read(id)).toString(),'original');
  await assert.rejects(()=>new LocalCredentialStore(dir,randomBytes(32),async()=>{}).read(id));
});
test('local test storage is disabled by default and forbidden in deployed environments',()=>{
  assert.deepEqual(configuredRegistration(readEnvironment({})),{});
  for(const APP_ENV of ['production','staging'])assert.throws(()=>readEnvironment({APP_ENV,DOCTOR_CREDENTIAL_STORAGE:'local-test'}));
  assert.throws(()=>readEnvironment({DOCTOR_REQUIRED_CREDENTIALS:'INVENTED'}));
});
test('fully configured local storage rejects every production environment combination',()=>{
  const local = {
    APP_ENV:'development',NODE_ENV:'development',ADMIN_SECURITY_MODE:'disabled',
    DATABASE_URL:'postgresql://localhost/credential_guard_test',SESSION_SECRET:randomBytes(32).toString('hex'),
    DOCTOR_CREDENTIAL_STORAGE:'local-test',DOCTOR_CREDENTIAL_ROOT:path.resolve('private-test-root'),
    DOCTOR_CREDENTIAL_SCANNER:path.resolve('MpCmdRun.exe'),DOCTOR_CREDENTIAL_KEY:randomBytes(32).toString('base64'),
  };
  assert.doesNotThrow(()=>readEnvironment(local));
  assert.doesNotThrow(()=>readEnvironment({...local,APP_ENV:'test',NODE_ENV:'test'}));
  for(const [APP_ENV,NODE_ENV] of [['production','production'],['staging','production'],['development','production'],['test','production']]) {
    const input={...local,APP_ENV,NODE_ENV};
    if(APP_ENV==='production'||APP_ENV==='staging') {
      assert.doesNotThrow(()=>readEnvironment({...input,DOCTOR_CREDENTIAL_STORAGE:'disabled'}));
      assert.throws(()=>readEnvironment(input),/DOCTOR_CREDENTIAL_STORAGE/);
    } else {
      // The existing global runtime guard already rejects this mismatch.
      assert.throws(()=>readEnvironment(input),/APP_ENV/);
    }
  }
  // Defense in depth for callers supplying a parsed/constructed Environment.
  assert.throws(()=>configuredRegistration({...readEnvironment(local),NODE_ENV:'production'}));
});
