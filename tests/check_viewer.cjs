// Entry point for all Node checks (CI and tests/run_all.sh): syntax of every viewer module, then the unit tests.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const web=path.join(__dirname,'../web');
for(const file of fs.readdirSync(web).filter(f=>f.endsWith('.js')))execFileSync(process.execPath,['--check',path.join(web,file)],{stdio:'inherit'});
for(const test of ['test_line_routing','test_lineage','test_i18n','test_family_layout','test_card_view','test_branch_colors','test_generation_scale','test_display_preferences','test_dates','test_contracts','test_layout_golden'])require('./'+test+'.cjs');
