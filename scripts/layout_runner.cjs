const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={window:{},structuredClone};vm.createContext(context);
for(const name of ['card-metrics','line-routing','family-layout'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',name+'.js'),'utf8'),context);
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{try{const request=JSON.parse(input);process.stdout.write(JSON.stringify(context.window.GenealogyFamilyLayout.create(request.data||request,request.presentation)));}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}});
