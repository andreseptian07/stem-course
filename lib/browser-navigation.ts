import { identity, db } from './server';
import { requirePermission } from './authorization';
import { AccessError } from './access-error';
import { navigationUser } from './account-navigation';
// Restricted accounts must still be able to inspect their access status.
export async function restrictedNavigation() {
  const u = await identity(true);
  try { await requirePermission(db(), u, 'account'); return navigationUser(u); }
  catch (e) { if (e instanceof AccessError && e.status === 403) return navigationUser(u, false); throw e; }
}
