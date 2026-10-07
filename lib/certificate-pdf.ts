import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, PDFName, PDFString, type PDFFont } from "pdf-lib";
import { AccessError } from "./access.ts";
import { certificateDate, type Certificate } from "./certificate-model.ts";
let fontBytes: Promise<Buffer> | undefined;
const loadFont = () => fontBytes ??= fs.readFile(path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"));
export async function validateCertificateText(...texts: string[]) {
  const font = fontkit.create(await loadFont());
  const supported = new Set(font.characterSet);
  if (texts.some(text => [...text].some(c => !supported.has(c.codePointAt(0)!))))
    throw new AccessError(422, "Nama atau judul memuat karakter yang belum didukung font sertifikat. Gunakan huruf Latin (termasuk aksen), Yunani atau Kiril tanpa emoji.");
}
function wrapped(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const character of text.replace(/\s+/g, " ").trim()) {
    const next = line + character;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line.trim());
      line = character.trimStart();
    }
    else
      line = next;
  }
  if (line)
    lines.push(line.trim());
  return lines;
}
export async function certificatePdf(c: Certificate, origin: string) {
  await validateCertificateText(c.recipientName, c.courseTitle);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await loadFont(), { subset: true });
  const page = pdf.addPage([842, 595]), ink = rgb(.09, .18, .23), teal = rgb(.03, .43, .40), gold = rgb(.71, .51, .23);
  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(.98, .98, .96) });
  page.drawRectangle({ x: 25, y: 25, width: 792, height: 545, borderWidth: 1.5, borderColor: gold });
  page.drawRectangle({ x: 40, y: 40, width: 762, height: 515, borderWidth: .5, borderColor: gold });
  const centered = (text: string, y: number, size: number, color = ink) => page.drawText(text, { x: (842 - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  centered("RUANG STEM", 503, 22, teal);
  centered("SERTIFIKAT PENYELESAIAN", 452, 28);
  centered("Diberikan kepada", 408, 12);
  let nameSize = 30;
  while (nameSize > 14 && wrapped(c.recipientName, font, nameSize, 690).length > 2)
    nameSize--;
  const nameLines = wrapped(c.recipientName, font, nameSize, 690);
  nameLines.forEach((l, i) => centered(l, 365 - i * (nameSize + 7), nameSize, teal));
  centered("telah menyelesaikan pembelajaran dan tugas yang diterima Tutor pada course", 281, 11);
  let titleSize = 21;
  while (titleSize > 11 && wrapped(c.courseTitle, font, titleSize, 680).length > 3)
    titleSize--;
  wrapped(c.courseTitle, font, titleSize, 680).forEach((l, i) => centered(l, 244 - i * (titleSize + 5), titleSize));
  centered(`Versi course ${c.courseVersion} · Diterbitkan ${certificateDate(c.issuedAt)}`, 151, 11);
  centered(c.number, 123, 10, teal);
  const url = `${origin}/certificates/verify/${c.number}`;
  let urlSize = 9;
  while (font.widthOfTextAtSize(url, urlSize) > 710 && urlSize > 5)
    urlSize -= .25;
  centered(url, 94, urlSize, teal);
  const link = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [60, 89, 782, 108], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } }));
  page.node.set(PDFName.of('Annots'), pdf.context.obj([link]));
  centered("Periksa status terkini melalui halaman verifikasi Ruang STEM.", 67, 9);
  pdf.setTitle(`Sertifikat ${c.number}`);
  pdf.setAuthor("Ruang STEM");
  pdf.setSubject("Penyelesaian course dan tugas kelas");
  pdf.setCreationDate(new Date(c.issuedAt));
  pdf.setModificationDate(new Date(c.issuedAt));
  return pdf.save();
}
