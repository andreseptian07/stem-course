import test from 'node:test';
import assert from 'node:assert/strict';
import {accountNavigation,navigationRole,navigationUser} from '../lib/account-navigation.ts';
import {embeddedVideo,lessonMediaURL} from '../lib/lesson-media.ts';
const user=(kind,capabilities={},owner=false)=>({name:'Public fixture',kind,capabilities:{tutor:false,curriculum:false,...capabilities},owner,active:true});
const keys=u=>accountNavigation(u).map(i=>i.key);
test('student menus exclude staff work, while personal certificates and learning remain available',()=>{
 const s=user('student',{tutor:true,curriculum:true});
 assert.deepEqual(keys(s),['dashboard','learn','classes','sessions','courses','profile','notifications','certificates','access']);
 assert.equal(navigationRole(s),'RUANG SISWA');
});
test('staff menus follow capability combinations; staff never receive student certificates or sessions',()=>{
 for(const u of [user('staff',{tutor:true}),user('staff',{curriculum:true}),user('staff',{tutor:true,curriculum:true}),user('staff',{},true)]){
  const links=accountNavigation(u),k=keys(u);
  assert.equal(k.includes('learn'),false);assert.equal(k.includes('sessions'),false);
  assert.equal(links.some(i=>i.href==='/certificates'),false);
  assert.equal(k.includes('classes'),u.owner||u.capabilities.tutor);
  assert.equal(k.includes('curriculum'),u.owner||u.capabilities.curriculum);
  assert.equal(k.includes('admin'),u.owner);
  assert.equal(new Set(k).size,k.length);
 }
 assert.equal(navigationRole(user('staff',{tutor:true,curriculum:true})),'TUTOR · TIM KURIKULUM');
});
test('restricted accounts retain only access status; serialized navigation omits authority versions and ids',()=>{
 const u={...user('staff',{tutor:true,curriculum:true},true),id:'fixture-id',accessVersion:42,principalVersion:7,grantVersions:{tutor:8,curriculum:9}};
 const projection=navigationUser(u,false);
 assert.deepEqual(keys(projection),['access']);
 assert.equal(JSON.stringify(projection).includes('fixture-id'),false);
 assert.equal('grantVersions' in projection,false);
});
test('protected media retains class scope and download query; external signed URLs are not altered',()=>{
 assert.equal(lessonMediaURL('/api/media/asset?version=2','class A',true),'/api/media/asset?version=2&class=class+A&download=1');
 assert.equal(lessonMediaURL('https://media.example.com/file?signature=fixture',null,true),'https://media.example.com/file?signature=fixture');
 assert.equal(embeddedVideo('https://youtu.be/dQw4w9WgXcQ'),'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(embeddedVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(embeddedVideo('https://vimeo.com/12345'),'https://player.vimeo.com/video/12345');
 for(const url of ['http://youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ','javascript:alert(1)','/api/media/private'])assert.equal(embeddedVideo(url),'');
});

test('unclassified account projection exposes only access status even if legacy access is active',()=>{assert.deepEqual(keys(navigationUser({...user('unclassified'),accessStatus:'active'})),['access']);});
