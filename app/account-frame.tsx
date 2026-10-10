'use client';
import { useState, useRef, type ReactNode, type MouseEventHandler } from 'react';
import Link from 'next/link';
import { Layers3, LayoutDashboard, BookOpen, Users, CalendarDays, Settings2, Award, UserRound, Bell, ShieldCheck, Menu, ChevronDown, LogOut } from 'lucide-react';
import { accountNavigation, navigationRole, type NavigationUser, type NavigationKey } from '@/lib/account-navigation';
import NotificationLink from './notification-link';
import './account.css';
const icons = { dashboard: LayoutDashboard, learn: BookOpen, classes: Users, sessions: CalendarDays, curriculum: Layers3, preview: BookOpen, admin: Settings2, certificates: Award, profile: UserRound, notifications: Bell, access: ShieldCheck, courses: BookOpen };
export function AccountHeader({ user, onNavigate }: { user: NavigationUser; onNavigate?: MouseEventHandler<HTMLAnchorElement> }) {
  return <header className="account-header shared-account-header">
    <Link className="account-brand" href="/dashboard" onClick={onNavigate}><span><Layers3 size={24}/></span><b>Ruang<span> STEM</span></b></Link>
    <Link className="account-catalog" href="/courses" onClick={onNavigate}>Jelajahi course</Link>
    {user.active && <><Link className="account-user" href="/profile" aria-label="Buka profil saya" onClick={onNavigate}><span className="account-avatar teal"><UserRound size={19}/></span><span>{user.name}</span></Link><NotificationLink onClick={onNavigate}/></>}
    <Link className="account-logout" href="/logout" onClick={onNavigate}><LogOut size={18}/>Keluar</Link>
  </header>;
}
export function AccountMenu({ user, current, onNavigate, compact = false }: { user: NavigationUser; current: NavigationKey; onNavigate?: MouseEventHandler<HTMLAnchorElement>; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const items = accountNavigation(user);
  const id = compact ? 'study-account-navigation' : 'account-navigation';
  return <aside onKeyDown={e=>{if(e.key === "Escape" && open){setOpen(false);toggle.current?.focus();}}} className={`account-sidebar ${open ? 'mobile-nav-open' : ''} ${compact ? 'account-menu-compact' : ''}`}>
    <span className="eyebrow">{navigationRole(user)}</span>
    <button ref={toggle} className="account-menu-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><Menu size={19}/>Menu akun<ChevronDown size={17}/></button>
    <nav id={id} aria-label="Navigasi akun">{items.map(item => { const Icon = icons[item.key]; return <Link key={item.key} href={item.href} className={current === item.key ? 'selected' : undefined} aria-current={current === item.key ? 'page' : undefined} onClick={e => { onNavigate?.(e); if (!e.defaultPrevented) setOpen(false); }}><Icon size={19}/>{item.label}</Link>; })}</nav>
  </aside>;
}
export default function AccountFrame({ user, current, children, mainId = 'account-main', className = '', onNavigate, mainTag = 'main' }: { user: NavigationUser; current: NavigationKey; children: ReactNode; mainId?: string; className?: string; mainTag?: 'main' | 'div'; onNavigate?: MouseEventHandler<HTMLAnchorElement> }) {
  const Content = mainTag;
  const label = accountNavigation(user).find(item => item.key === current)?.label || 'Akun saya';
  return <div className="account-app shared-account-frame"><a className="account-skip" href={`#${mainId}`}>Lewati ke konten</a><AccountHeader user={user} onNavigate={onNavigate}/><div className="account-layout"><AccountMenu user={user} current={current} onNavigate={onNavigate}/><Content tabIndex={-1} id={mainId} className={`account-main ${className}`}><nav className="account-breadcrumb" aria-label="Jejak navigasi">{current !== 'dashboard' && user.active && <><Link href="/dashboard" onClick={onNavigate}>Dashboard</Link><span aria-hidden="true">/</span></>}<span aria-current="page">{label}</span></nav>{children}</Content></div></div>;
}
