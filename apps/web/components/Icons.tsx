const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
export const MenuIcon = () => <svg {...p} width={22} height={22}><path d="M4 8h16M4 16h10" /></svg>;
export const PlusIcon = () => <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const SendIcon = () => <svg {...p} strokeWidth={1.9}><path d="M12 19V6M6 11l6-6 6 6" /></svg>;
export const PlugIcon = () => <svg {...p} width={18} height={18}><path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v3" /></svg>;
export const CloseIcon = () => <svg {...p} width={18} height={18}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const StopIcon = () => <svg {...p} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
