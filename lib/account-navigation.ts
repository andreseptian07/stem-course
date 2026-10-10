import type { AccessContext } from './authorization';
export type NavigationUser = Pick<AccessContext, 'name' | 'kind' | 'owner' | 'capabilities'> & { active: boolean };
export type NavigationKey = 'dashboard' | 'learn' | 'classes' | 'sessions' | 'curriculum' | 'preview' | 'admin' | 'certificates' | 'profile' | 'notifications' | 'access' | 'courses';
export function navigationUser(u: AccessContext, active = true): NavigationUser {
  return { name: u.name, kind: u.kind, owner: u.owner, capabilities: { ...u.capabilities }, active: active && (u.owner || u.kind === "student" || u.kind === "staff") };
}
export function accountNavigation(u: NavigationUser): { key: NavigationKey; href: string; label: string }[] {
  if (!u.active) return [{ key: 'access', href: '/access', label: 'Status akses akun' }];
  const student = !u.owner && u.kind === 'student';
  const items: ReturnType<typeof accountNavigation> = [{ key: 'dashboard', href: '/dashboard', label: 'Dashboard' }];
  if (student) items.push({ key: 'learn', href: '/learn', label: 'Belajar' });
  if (u.owner || student || u.capabilities.tutor) items.push({ key: 'classes', href: '/classes', label: student ? 'Kelas saya' : 'Kelas & Tutor' });
  if (student) items.push({ key: 'sessions', href: '/learn?view=sessions', label: 'Sesi Tutor' });
  if (u.owner || (u.kind === 'staff' && u.capabilities.curriculum)) items.push({ key: 'curriculum', href: '/curriculum', label: 'Tim Kurikulum' });
  if (u.owner || u.kind === 'staff') items.push({ key: 'preview', href: '/preview', label: 'Pratinjau materi' });
  if (u.owner) items.push({ key: 'admin', href: '/learn?view=admin', label: 'Kelola course' });
  items.push({ key: 'courses', href: '/courses', label: 'Katalog course' }, { key: 'profile', href: '/profile', label: 'Profil saya' }, { key: 'notifications', href: '/notifications', label: 'Notifikasi' });
  if (student) items.push({ key: 'certificates', href: '/certificates', label: 'Sertifikat saya' });
  if (u.owner) items.push({ key: 'certificates', href: '/certificates?admin=1', label: 'Kelola sertifikat' });
  items.push({ key: 'access', href: '/access', label: u.owner ? 'Kelola akses' : 'Akses akun' });
  return items;
}
export function navigationRole(u: NavigationUser) {
  if (!u.active) return 'STATUS AKUN';
  if (u.owner) return 'SUPER ADMIN';
  if (u.kind === 'student') return 'RUANG SISWA';
  if (u.capabilities.tutor && u.capabilities.curriculum) return 'TUTOR · TIM KURIKULUM';
  if (u.capabilities.tutor) return 'RUANG TUTOR';
  if (u.capabilities.curriculum) return 'TIM KURIKULUM';
  return 'AKUN SAYA';
}
