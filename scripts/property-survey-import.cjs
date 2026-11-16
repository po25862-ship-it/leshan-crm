const fs=require('node:fs');
const path=require('node:path');
async function main(){
  if(process.env.VERCEL_ENV!=='production'){console.log('Property survey import: production-only; skipped.');return;}
  const source=path.join(__dirname,'../api/_data/property-survey-initial.private.json');
  if(!fs.existsSync(source)){console.log('Property survey import: no private migration file; skipped.');return;}
  const initial=JSON.parse(fs.readFileSync(source,'utf8'));
  const {ensureFirebaseAdmin}=require('../api/_lib/market-auth');
  const {createSurveyService,caseId,OWNER_UID,validateDraft}=require('../api/_lib/property-survey-service');
  for(const draft of initial)validateDraft(draft);
  const {firestore}=ensureFirebaseAdmin(),service=createSurveyService(firestore);
  await service.seed(OWNER_UID,initial);
  for(const draft of initial){const record=await service.get(OWNER_UID,caseId(draft.salesData.case_name));if(!record.salesData.case_name||record.ownerUid!==OWNER_UID)throw new Error('migration_verification_failed');}
  console.log(`Property survey import: ${initial.length} private cases verified in Firestore; existing records preserved.`);
}
main().catch(error=>{console.error('Property survey import failed:',error.code||error.name||'unknown');process.exitCode=1;});
