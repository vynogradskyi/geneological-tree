const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const dictionaries=Object.fromEntries(['pl','ru','en'].map(l=>[l,JSON.parse(fs.readFileSync(`locales/${l}.json`))]));
for(const lang of ['ru','en'])assert.deepEqual(Object.keys(dictionaries[lang]).sort(),Object.keys(dictionaries.pl).sort());
const context={window:{GENEALOGY_LOCALES:dictionaries},localStorage:{getItem:()=> 'en',setItem(){}},location:{protocol:'file:'},document:{documentElement:{},body:{querySelectorAll:()=>[]},createTreeWalker:()=>({nextNode:()=>null})},NodeFilter:{SHOW_TEXT:4},structuredClone};
vm.createContext(context);vm.runInContext(fs.readFileSync('web/i18n.js','utf8'),context);
(async()=>{
 const I=context.window.GenealogyI18n;await I.ready;
 assert.equal(I.t('Jestem z rodziny'),"I'm family");
 assert.equal(I.translate('z domu Test'),'née Test');
 const raw={id:'person_0001',notes:'tekst polski',firstName:'Approved',Mommy:'person_0002',birthDate:'1989'};
 const state={translations:{en:{people:{person_0001:{source:{notes:raw.notes},values:{notes:'English note',Mommy:'forbidden'}}}}}};
 const localized=I.person(raw,state);
 assert.equal(localized.notes,'English note');assert.equal(localized.Mommy,raw.Mommy);assert.equal(localized.birthDate,raw.birthDate);assert.equal(raw.notes,'tekst polski');
 raw.notes='zmieniono tekst';assert.equal(I.person(raw,state).notes,raw.notes);
 I.setLanguage('ru');assert.equal(I.t('Zapisz'),'Сохранить');
 I.setLanguage('invalid');assert.equal(I.language,'ru');
 I.setLanguage('pl');assert.equal(I.person(raw,state),raw);
 console.log('I18n: locale keys, interpolation, shared facts, unchanged originals and stale translation fallback verified.');
})().catch(e=>{console.error(e);process.exitCode=1;});
