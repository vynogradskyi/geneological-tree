const path=require('node:path'),{execFileSync}=require('node:child_process');
for(const file of ['editor-storage','editor','responsive','data-loader','locale-bundle','branch-colors'])execFileSync(process.execPath,['--check',path.join(__dirname,'../web',file+'.js')],{stdio:'inherit'});
for(const test of ['test_family_auth','test_i18n','test_family_layout','test_layout_cache','test_card_view','test_branch_colors'])require('./'+test+'.cjs');
