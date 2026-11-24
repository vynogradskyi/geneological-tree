const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto,pbkdf2Sync}=require('node:crypto');
const context={window:{},document:{documentElement:{dataset:{familyPrototype:'true'}}},location:{pathname:'/'},crypto:webcrypto,TextEncoder,Uint8Array,atob,btoa};
vm.createContext(context);vm.runInContext(fs.readFileSync('web/family-auth.js','utf8'),context);
(async()=>{
  const salt=Buffer.from('synthetic-test-salt'),password='synthetic-test-password';
  const user={salt:salt.toString('base64'),iterations:600000,passwordHash:pbkdf2Sync(password,salt,600000,32,'sha256').toString('base64')};
  assert.equal(await context.window.GenealogyFamily.verify(password,user),true);
  assert.equal(await context.window.GenealogyFamily.verify('wrong',user),false);
  user.salt=Buffer.from('another-salt').toString('base64');
  assert.equal(await context.window.GenealogyFamily.verify(password,user),false);
  console.log('Family prototype: Web Crypto hashes agree with PBKDF2; wrong password and wrong salt rejected.');
})().catch(e=>{console.error(e);process.exitCode=1;});
