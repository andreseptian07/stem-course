import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaRange} from '../lib/media-range.ts';
import {inspectCourseMedia} from '../lib/course-media-format.ts';
import {inspectFile} from '../lib/project-files.ts';
const box=(type,body)=>{const b=Buffer.alloc(body.length+8);b.writeUInt32BE(b.length);b.write(type,4);body.copy(b,8);return b;};
const mp4=Buffer.concat([box('ftyp',Buffer.from('isom0000isom')),box('moov',Buffer.from('fixture')),box('mdat',Buffer.from('fixture'))]);
test('video byte ranges handle prefix, suffix, capped ends and invalid ranges',()=>{
 assert.equal(mediaRange(null,100),null);
 assert.deepEqual(mediaRange('bytes=0-9',100),{start:0,end:9,invalid:false});
 assert.deepEqual(mediaRange('bytes=90-',100),{start:90,end:99,invalid:false});
 assert.deepEqual(mediaRange('bytes=-10',100),{start:90,end:99,invalid:false});
 assert.deepEqual(mediaRange('bytes=90-999',100),{start:90,end:99,invalid:false});
 assert.deepEqual(mediaRange('bytes=-1000',100),{start:0,end:99,invalid:false});
 for(const h of ['bytes=100-','bytes=10-1','bytes=-0','bytes=-','bytes=0-2,5-8','bytes=9007199254740992-','items=0-1'])assert.equal(mediaRange(h,100).invalid,true,h);
});
test('MP4 applies only to course upload; forged extension and truncated containers are rejected',()=>{
 assert.equal(inspectCourseMedia('video.mp4',mp4).mime,'video/mp4');
 assert.equal(inspectCourseMedia('../video.mp4',mp4).name,'video.mp4');
 assert.throws(()=>inspectFile('video.mp4',mp4));
 for(const bytes of [Buffer.from('<html>not a video</html>'),mp4.subarray(0,20),mp4.subarray(0,mp4.length-1)])assert.throws(()=>inspectCourseMedia('video.mp4',bytes));
 assert.equal(inspectCourseMedia('notes.txt',Buffer.from('Public fixture')).mime,'text/plain; charset=utf-8');
});
