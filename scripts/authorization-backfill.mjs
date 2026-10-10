import { readFile, writeFile } from "node:fs/promises";
import { createMariaDb } from "../db/mariadb.ts";
import { authorizationInventory, backfillAuthorization } from "../lib/authorization-migration.ts";
import { AccessError } from "../lib/access-error.ts";
const [action,path,...extra]=process.argv.slice(2);
if (!['dry-run','apply'].includes(action)||!path||extra.length) throw new Error('Gunakan dry-run <file-laporan.json> atau apply <file-plan.json>. Schema harus sudah terpasang.');
const {pool,database}=createMariaDb();
try {
  if (action==='dry-run') {
    const report=await authorizationInventory(database);
    await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({accounts:report.rows.length,needsReview:report.rows.filter(r=>r.kind==='unclassified').length,sourceHash:report.sourceHash}));
  } else {
    const result=await backfillAuthorization(database,JSON.parse(await readFile(path,'utf8')));
    console.log(JSON.stringify(result));
  }
} catch(e) {
  console.error(e instanceof AccessError?e.message:'Backfill belum dapat diproses. Periksa schema dan koneksi tanpa mencetak kredensial.');
  process.exitCode=1;
} finally {await pool.end();}
