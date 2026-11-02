import { splitNeedData, mergeNeedPrivate, needShareTitle } from './needPrivacy';
const legacy={title:'陳先生換屋',contactId:'private-buyer',contactName:'陳先生',notes:'私人聯繫備註',shared:true,areas:[{city:'桃園市',district:'龜山區',community:'A7'}],budget:1800,minMainArea:15,minRooms:2,unknownPrivateField:'secret'};
test('public needs contain only conditions; legacy title, identity, notes and unknown fields stay out',()=>{
 const {publicData,privateData}=splitNeedData(legacy,'owner');
 expect(JSON.stringify(publicData)).not.toMatch(/陳先生|private-buyer|私人聯繫|secret/);
 expect(publicData).toMatchObject({schemaVersion:2,budgetMax:1800,mainAreaMin:15,roomsMin:2,shared:true});
 expect(privateData).toMatchObject({contactId:'private-buyer',contactName:'陳先生',privateTitle:'陳先生換屋',notes:'私人聯繫備註'});
 expect(mergeNeedPrivate(publicData,privateData).title).toBe(legacy.title);
 expect(mergeNeedPrivate(publicData,null).contactId).toBeUndefined();
});
test('explicit public alias is separate from the private name',()=>{
 const {publicData,privateData}=splitNeedData({...legacy,shareAlias:'A7兩房平車需求'},'owner');
 expect(publicData.title).toBe('A7兩房平車需求');expect(privateData.privateTitle).toBe('陳先生換屋');
 expect(needShareTitle({title:'secret'})).toBe('找房需求');
});
