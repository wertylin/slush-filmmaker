'use client';
import Link from 'next/link';
import { ArrowUpRight, Lock, X } from 'lucide-react';
export const photos = {
 founder: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=1000&q=85',
 stage: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=85',
 product: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=85',
 team: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=85',
 earth: 'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&w=1200&q=85',
 agent: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=85',
};
export const templates = [
 { id: 'founder', name: 'The founder story', category: 'STORY', time: '60–90 SEC', image: photos.founder, headline: 'IT STARTS\nWITH YOU.', description: 'The why behind what you’re building.', locked: false },
 { id: 'pitch', name: 'The demo day pitch', category: 'PITCH', time: '30–60 SEC', image: photos.stage, headline: 'YOUR NEXT\nBIG MOMENT.', description: 'Make your first impression impossible to forget.', locked: true },
 { id: 'launch', name: 'The product launch', category: 'LAUNCH', time: '30–45 SEC', image: photos.product, headline: 'BUILT FOR\nWHAT’S NEXT.', description: 'Give your next big thing a proper entrance.', locked: true },
 { id: 'update', name: 'The investor update', category: 'UPDATE', time: '45–60 SEC', image: photos.team, headline: 'LOOK HOW\nFAR WE’VE COME.', description: 'Show the progress behind the numbers.', locked: true },
];
export function isTemplateAvailable(id: string) {
  return templates.some((t) => t.id === id && !t.locked);
}
export function Logo() { return <Link href="/" className="logo" aria-label="Slush Filmmaker home"><strong>SLUSH<span>®</span></strong><small>F I L M M A K E R</small></Link>; }
export function TemplateCards({ onSelect }: { onSelect?: (id: string) => void }) {
  return (
    <div className="template-grid">
      {templates.map((t, i) => (
        <button
          className={`template-card${t.locked ? ' locked' : ''}`}
          key={t.id}
          type="button"
          disabled={t.locked}
          aria-disabled={t.locked}
          onClick={() => {
            if (!t.locked) onSelect?.(t.id);
          }}
        >
          <div className="template-art">
            <img src={t.image} alt={t.name} loading="lazy" />
            <span className="template-number">0{i + 1} / {t.category}</span>
            <h3>{t.headline}</h3>
            <span className="duration">{t.locked ? 'LOCKED' : t.time}</span>
            <span className="card-arrow">{t.locked ? <Lock size={16} /> : <ArrowUpRight size={18} />}</span>
          </div>
          <div className="template-copy">
            <h4>{t.name}</h4>
            <p>{t.locked ? 'Coming soon — founder story is available now.' : t.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
export function Preview({ id, close, useTemplate }: { id: string; close: () => void; useTemplate: () => void }) {
  const t = templates.find((x) => x.id === id && !x.locked) || templates.find((x) => !x.locked) || templates[0];
  return (
    <div className="modal-backdrop" onClick={close}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={t.name} onClick={(e) => e.stopPropagation()}>
        <button className="close icon-button" onClick={close} aria-label="Close preview" autoFocus><X /></button>
        <div className="modal-image"><img src={t.image} alt={t.name} /><h2>{t.headline}</h2></div>
        <div className="modal-body">
          <span className="eyebrow">TEMPLATE CONCEPT · {t.time}</span>
          <h2>{t.name}</h2>
          <p>{t.description} Customize the story, choose your scenes, and make it yours.</p>
          <p className="muted">Visual storyboard preview. Video generation is not connected yet.</p>
          <button className="button primary" onClick={useTemplate}>Use this template <ArrowUpRight size={18} /></button>
        </div>
      </section>
    </div>
  );
}
