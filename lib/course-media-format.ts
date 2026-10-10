import {inspectFile,FILE_LIMIT} from './project-files.ts';
import {ClassError} from './classes.ts';
// MP4 is accepted only for course media; task attachments and avatars retain their existing formats.
export function inspectCourseMedia(name: string, bytes: Uint8Array) {
  if (!/\.mp4$/i.test(name)) return inspectFile(name,bytes);
  if (!bytes.length || bytes.length > FILE_LIMIT) throw new ClassError(413,'Video maksimal 5 MB. Gunakan tautan video untuk berkas yang lebih besar.');
  const data = Buffer.from(bytes), brands=['isom','iso2','mp41','mp42','avc1','M4V ','dash'];
  let offset=0, ftyp=false, moov=false, mdat=false;
  while (offset + 8 <= data.length) {
    const length=data.readUInt32BE(offset), type=data.toString('ascii',offset+4,offset+8);
    if (length < 8 || length > data.length-offset) throw new ClassError(400,'Berkas MP4 tidak valid.');
    if (offset===0 && type==='ftyp' && length >= 16) ftyp=brands.includes(data.toString('ascii',offset+8,offset+12));
    if (type==='moov') moov=true;
    if (type==='mdat' && length>8) mdat=true;
    offset+=length;
  }
  if (!ftyp || !moov || !mdat || offset!==data.length) throw new ClassError(400,'Berkas MP4 tidak valid.');
  const clean=name.replace(/\\/g,'/').split('/').pop()!.normalize('NFC').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').trim();
  if (!clean || clean.length>180) throw new ClassError(400,'Nama berkas tidak valid.');
  return {name:clean,mime:'video/mp4',size:bytes.length};
}
