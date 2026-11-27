// TC-UNIT-DATES: date display rules from design-rules.md (`?` unknown, `...` confirmed living).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/dates.js'),'utf8'),context);
const D=context.window.GenealogyDates;
assert.equal(D.date('2010-05-14'),'14.05.2010','Full date is DD.MM.YYYY');
assert.equal(D.date('1982-03'),'03.1982','Month precision keeps MM.YYYY');
assert.equal(D.date('1950'),'1950','Year only');
assert.equal(D.date(null),'?');assert.equal(D.date(''),'?');assert.equal(D.date(undefined),'?');
const person=(fields)=>({birthDate:null,deathDate:null,isLiving:null,...fields});
assert.equal(D.life(person({birthDate:'2010-05-14',isLiving:true})),'14.05.2010 – ...','Living: ellipsis instead of death date');
assert.equal(D.life(person({birthDate:'1982-03-01'})),'01.03.1982 – ?','Unknown status: question mark');
assert.equal(D.life(person({birthDate:'1950',isLiving:false,deathDate:'2015-11-02'})),'1950 – 02.11.2015');
assert.equal(D.life(person({isLiving:false})),'? – ?','Deceased without dates');
assert.equal(D.life(person({birthDate:'1952',isLiving:false,deathDate:'2001',deathDateNote:'około'})),'1952 – 2001 (około)');
assert.equal(D.life(person({birthDateNote:'przed 1917'})),'? (przed 1917) – ?','Approximate note without a date');
assert.equal(D.part(person({isLiving:true,deathDate:'2000'}),'death'),'...','Living status always wins over a stray death date');
assert.equal(D.part(person({isLiving:true,birthDate:'2001'}),'birth'),'2001','Ellipsis applies only to death');
console.log('Dates: DD.MM.YYYY, partial dates, `?` for unknown, `...` for confirmed living, approximate notes verified.');
