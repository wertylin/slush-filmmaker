import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Slush Filmmaker — Your story deserves a film', description: 'A creative workspace for founders. Shape your story, explore cinematic templates, and build alongside your AI agent.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
