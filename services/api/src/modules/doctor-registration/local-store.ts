import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { lstat, realpath, readFile, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ApiError } from '../../errors/api-error.js';
import { maxDocumentBytes, type PrivateCredentialStore, type RegistrationDependencies, type CredentialKind } from './contracts.js';
import type { Environment } from '../../config/env.js';
const exec = promisify(execFile);
const failure = () => new ApiError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Secure storage or document scanning is unavailable. Please retry later.');
const objectKey = new RegExp('^doctor-credentials/[0-9a-f-]{36}/[0-9a-f-]{36}$');
export type ScanFile = (file: string) => Promise<void>;

// Test-only adapter. The root must be provisioned privately outside any public/static tree.
export class LocalCredentialStore implements PrivateCredentialStore {
  readonly available = true;
  constructor(private root: string, private key: Buffer, private scan: ScanFile) {
    if (!path.isAbsolute(root) || key.length !== 32) throw failure();
  }
  private file(key: string) {
    if (!objectKey.test(key)) throw failure();
    return path.join(this.root, createHash('sha256').update(key).digest('hex') + '.enc');
  }
  private async privateRoot() {
    const st = await lstat(this.root);
    if (!st.isDirectory() || st.isSymbolicLink() || path.resolve(await realpath(this.root)).toLowerCase() !== path.resolve(this.root).toLowerCase()) throw failure();
    if (process.platform !== 'win32') {
      if ((st.mode & 0o077) !== 0 || (process.getuid && st.uid !== process.getuid())) throw failure();
    } else {
      const script = "$ErrorActionPreference='Stop'; $a=Get-Acl -LiteralPath $env:PD_CREDENTIAL_ROOT; $me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; if (!$a.AreAccessRulesProtected -or $a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $me) {exit 1}; foreach($r in $a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -notin @($me,'S-1-5-18','S-1-5-32-544')) {exit 1}}";
      await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000,maxBuffer:4096,env:{...process.env,PD_CREDENTIAL_ROOT:this.root}});
    }
  }
  async put(key: string, bytes: Buffer, _contentType: string) {
    const target=this.file(key);let quarantine='';
    try {
      await this.privateRoot();if (!bytes.length || bytes.length > maxDocumentBytes) throw failure();
      quarantine=path.join(this.root,randomBytes(24).toString('hex')+'.scan');
      const temp=await open(quarantine,'wx',0o600);try{await temp.writeFile(bytes);}finally{await temp.close();}
      await this.scan(quarantine);
      // Do not encrypt modified/remediated bytes or accept scanner-side substitutions.
      if (!(await readFile(quarantine)).equals(bytes)) throw failure();
      await unlink(quarantine);quarantine='';
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(key));
      const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
      const out=await open(target,'wx',0o600);
      try{await out.writeFile(Buffer.concat([Buffer.from('PDC1'),iv,cipher.getAuthTag(),ciphertext]));await out.sync();}
      catch(error){await out.close();await unlink(target).catch(()=>{});throw error;}finally{await out.close().catch(()=>{});}
    }catch{throw failure();}finally{if(quarantine)await unlink(quarantine).catch(()=>{});}
  }
  async read(key: string) {
    try {
      await this.privateRoot();const file=this.file(key),st=await lstat(file);
      if(!st.isFile()||st.isSymbolicLink()||st.size>maxDocumentBytes+32)throw failure();
      const data=await readFile(file);if(data.subarray(0,4).toString()!=='PDC1')throw failure();
      const decipher=createDecipheriv('aes-256-gcm',this.key,data.subarray(4,16));decipher.setAAD(Buffer.from(key));decipher.setAuthTag(data.subarray(16,32));
      return Buffer.concat([decipher.update(data.subarray(32)),decipher.final()]);
    }catch{throw failure();}
  }
  async remove(key: string) {try{await this.privateRoot();await unlink(this.file(key));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw failure();}}
}

export function defenderScanner(executable: string): ScanFile {
  if(process.platform!=='win32'||!path.isAbsolute(executable)||path.basename(executable).toLowerCase()!=='mpcmdrun.exe')throw failure();
  return async file=>{try{await exec(executable,['-Scan','-ScanType','3','-File',file,'-DisableRemediation'],{windowsHide:true,timeout:60000,maxBuffer:65536});}catch{throw failure();}};
}
export function configuredRegistration(env: Environment): RegistrationDependencies {
  const deferDocuments = env.DOCTOR_REGISTRATION_DEFER_DOCUMENTS === 'true';
  if (deferDocuments && (!['test','development'].includes(env.APP_ENV) || env.NODE_ENV === 'production')) throw failure();
  if(env.DOCTOR_CREDENTIAL_STORAGE==='disabled')return deferDocuments ? {deferDocuments:true} : {};
  if(!['test','development'].includes(env.APP_ENV))throw failure();
  return {deferDocuments,store:new LocalCredentialStore(env.DOCTOR_CREDENTIAL_ROOT,Buffer.from(env.DOCTOR_CREDENTIAL_KEY,'base64'),defenderScanner(env.DOCTOR_CREDENTIAL_SCANNER)),
    ...(env.DOCTOR_REQUIRED_CREDENTIALS ? {requiredKinds:env.DOCTOR_REQUIRED_CREDENTIALS.split(',') as CredentialKind[]} : {})};
}
