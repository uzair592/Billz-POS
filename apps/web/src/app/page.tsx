import Link from 'next/link';
import { ArrowRight, Coffee, ShieldCheck } from 'lucide-react';

export default function Home() {
  return <main className="landing">
    <nav><div className="brand"><span className="brand-mark"><Coffee size={20} /></span><span>Countertop</span></div><Link className="text-link" href="/platform/login">Platform admin</Link></nav>
    <section className="hero">
      <div className="eyebrow"><ShieldCheck size={16} /> Secure multi-tenant operations</div>
      <h1>A calmer way to run a busy restaurant.</h1>
      <p>One workspace for your branches, team, permissions, and daily service. Phase 1 establishes your secure business account and operating setup.</p>
      <Link className="button link-button" href="/login">Sign in to your workspace <ArrowRight size={18} /></Link>
    </section>
    <footer>Built for cafés, restaurants, bakeries, and fast-moving food teams.</footer>
  </main>;
}
