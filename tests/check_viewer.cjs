const path=require('node:path'),{execFileSync}=require('node:child_process');
for(const file of ['editor-storage','editor','responsive','data-loader','locale-bundle','branch-colors','generation-scale','family-fields','source-info','lineage'])execFileSync(process.execPath,['--check',path.join(__dirname,'../web',file+'.js')],{stdio:'inherit'});
for(const test of ['test_lineage','test_family_auth','test_i18n','test_family_layout','test_layout_cache','test_card_view','test_branch_colors','test_generation_scale','test_display_preferences','test_draft_display'])require('./'+test+'.cjs');
