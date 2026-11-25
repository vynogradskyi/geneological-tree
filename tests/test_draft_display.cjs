const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const draft={data:{rootPersonId:'root',people:[{id:'root',notes:'saved local draft'}]},photoData:{'photos/local.png':'unchanged-photo'},presentation:{version:1,colors:{root:'#111111'}}};
const record={baseHash:'facts:translations',state:structuredClone(draft),savedAt:'synthetic-time'};
const db={transaction(){return{objectStore(){return{get(){const request={result:record};queueMicrotask(()=>request.onsuccess());return request;}};}};}};
const context={window:{},structuredClone,location:{pathname:'/',protocol:'file:'},console,indexedDB:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('web/editor-storage.js','utf8'),context);
(async()=>{
 const seed={data:{rootPersonId:'root',people:[{id:'root',notes:'published'}]},sourceSha256:'facts',translationSha256:'translations',presentation:{version:1,colors:{root:'#a46b42'}}};
 const storage=await context.window.GenealogyStorage.open(seed,{browserOnly:true});
 assert.equal(storage.state.data.people[0].notes,'saved local draft');assert.equal(storage.state.photoData['photos/local.png'],'unchanged-photo');
 assert.equal(storage.state.presentation.colors.root,'#a46b42');assert.equal(storage.staleBackup,null,'A presentation-only update must not invalidate family edits');
 assert.equal(record.state.data.people[0].notes,draft.data.people[0].notes);
 console.log('Draft preservation: current display preferences applied without discarding browser records or uploaded photos.');
})().catch(error=>{console.error(error);process.exitCode=1;});
