"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
export default function PasswordField({ label, name, autoComplete, minLength }: { label: string; name: string; autoComplete: string; minLength: number }) {
  const [visible, setVisible] = useState(false);
  return <label>{label}<span className="password-field">
    <input aria-label={label} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required minLength={minLength} maxLength={128} />
    <button type="button" className="password-toggle" aria-label={`${visible ? "Sembunyikan" : "Tampilkan"} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
  </span></label>;
}
