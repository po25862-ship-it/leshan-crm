import {saveNeedRecord,recordNeedIntroduction} from './needRepository';
import {runTransaction} from 'firebase/firestore';
const mockDocs=new Map();const mockWrites=[];
jest.mock('../firebase',()=>({db:{}}));
jest.mock('firebase/firestore',()=>({
 collection:(_,...p)=>({path:p.join('/')}),doc:(_,...p)=>({id:p.length?p[p.length-1]:'new',path:p.length?p.join('/'):'needs/new'}),serverTimestamp:()=> 'server-time',getDoc:jest.fn(),writeBatch:jest.fn(),runTransaction:jest.fn(),
}));
beforeEach(()=>{mockDocs.clear();mockWrites.length=0;runTransaction.mockImplementation(async(_,fn)=>fn({get:async ref=>({exists:()=>mockDocs.has(ref.path),data:()=>mockDocs.get(ref.path)}),set:(ref,data)=>mockWrites.push({path:ref.path,data}),update:(ref,data)=>mockWrites.push({path:ref.path,data})}));});
test('full save atomically separates private data from shared conditions',async()=>{
 await saveNeedRecord({title:'私人名稱',contactId:'buyer',contactName:'姓名',notes:'私人備註',budgetMax:1800,areas:[]},'owner');
 expect(mockWrites).toHaveLength(2);expect(JSON.stringify(mockWrites[0].data)).not.toMatch(/姓名|私人備註|私人名稱/);
 expect(mockWrites[1].path).toBe('needs/new/private/details');expect(mockWrites[1].data.contactName).toBe('姓名');
});
const payload={recipientId:'buyer',properties:[{id:'p1',title:'物件'}],communication:'已傳送的最後版本',eventId:'intro-one',day:'2026-11-02'};
const seed=()=>{mockDocs.set('needs/n1',{ownerUid:'owner',recommendedProperties:[{propertyId:'p1',status:'pending'},{propertyId:'p2',status:'pending'}]});mockDocs.set('needs/n1/private/details',{contactId:'buyer'});};
test('confirmed introduction writes the interaction and updates only selected recommendations in one transaction',async()=>{
 seed();const result=await recordNeedIntroduction('n1',payload,'owner');
 expect(mockWrites).toHaveLength(3);expect(mockWrites[0]).toMatchObject({path:'contacts/buyer/interactions/intro-one',data:{communication:payload.communication}});
 expect(result[0].status).toBe('introduced');expect(result[1].status).toBe('pending');
});
test('retrying a confirmed introduction does not create a duplicate interaction',async()=>{
 seed();mockDocs.set('contacts/buyer/interactions/intro-one',{});await recordNeedIntroduction('n1',payload,'owner');expect(mockWrites).toHaveLength(0);
});
test('a changed recipient is rejected before either document is written',async()=>{
 seed();mockDocs.set('needs/n1/private/details',{contactId:'other'});await expect(recordNeedIntroduction('n1',payload,'owner')).rejects.toThrow('介紹對象已變更');expect(mockWrites).toHaveLength(0);
});

test('editing conditions preserves recommendations concurrently added by another colleague',async()=>{
 mockDocs.set('needs/n1',{ownerUid:'owner',createdAt:'old',recommendedProperties:[{propertyId:'new-from-colleague',status:'pending'}]});
 await saveNeedRecord({title:'私人名稱',budgetMax:1800,recommendedProperties:[]},'owner','n1');
 expect(mockWrites.find(w=>w.path==='needs/n1').data.recommendedProperties).toEqual([{propertyId:'new-from-colleague',status:'pending'}]);
});
