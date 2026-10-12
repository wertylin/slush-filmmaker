'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Sparkles, Play, Pause, Film, SlidersHorizontal, Menu, X, Globe, MousePointer2, Maximize2, Volume2, KeyRound, Check } from 'lucide-react';
import { Logo, TemplateCards, Preview, photos } from '@/components/shared';
import { useWebMCP, callWebMCPTool } from '@/components/webmcp';
import { getOpenAIKey, setOpenAIKey, validateOpenAIKey } from '@/components/keys';

const EXAMPLE_VIDEO = 'https://assets.mixkit.co/videos/preview/mixkit-man-talking-to-the-camera-4083-large.mp4';

function ExampleFilm() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState('0:00');
  const [duration, setDuration] = useState('0:00');

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  return (
    <div className="example-film">
      <video
        ref={ref}
        className="example-film-video"
        src={EXAMPLE_VIDEO}
        poster={photos.founder}
        playsInline
        preload="metadata"
        onClick={toggle}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
          setTime(fmt(v.currentTime));
        }}
        onLoadedMetadata={(e) => setDuration(fmt(e.currentTarget.duration))}
        onEnded={() => { setPlaying(false); setProgress(100); }}
      />
      <div className="example-film-shade" />
      <div className="example-film-title">YOUR STORY.<br/><em>ON SCREEN.</em></div>
      {!playing && (
        <button className="example-film-play" onClick={toggle} aria-label="Play example film">
          <Play size={28} fill="currentColor" />
        </button>
      )}
      <div className="example-film-bar">
        <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <span className="example-film-time">{time} / {duration}</span>
        <div className="example-film-track" aria-hidden>
          <i style={{ width: `${progress}%` }} />
        </div>
        <Volume2 size={15} />
        <Maximize2 size={15} />
      </div>
      <div className="example-film-caption">EXAMPLE FOUNDER FILM · 90 SEC</div>
    </div>
  );
}

export default function Landing() {
 const [preview, setPreview] = useState<string | null>(null); const [menu, setMenu] = useState(false);
 const [openaiKey, setOpenaiKey] = useState(''); const [keyStatus, setKeyStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle'); const [keyError, setKeyError] = useState('');
 useEffect(() => { setOpenaiKey(getOpenAIKey()); const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPreview(null); setMenu(false); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);
 useWebMCP({ preview: setPreview, start: (id) => { window.location.href = `/studio?template=${encodeURIComponent(id || 'founder')}`; } });
 async function saveKey() {
   setKeyStatus('checking');
   setKeyError('');
   const result = await validateOpenAIKey(openaiKey);
   if (!result.ok) {
     setKeyStatus('error');
     setKeyError(result.error);
     return;
   }
   setOpenAIKey(openaiKey);
   setKeyStatus('ok');
   try {
     await callWebMCPTool('open_studio', { templateId: 'founder' });
   } catch {
     window.location.href = '/studio?template=founder';
   }
 }
 return <main className="landing"><section className="entrance"><div className="landing-atmosphere" aria-hidden>
  <video className="landing-atmosphere-video" autoPlay muted loop playsInline preload="metadata">
    <source src="/back_video.mp4" type="video/mp4" media="(min-width: 761px)" />
  </video>
</div><header className="topbar container"><Logo/><nav className={menu ? 'nav open' : 'nav'}><a href="#templates" onClick={()=>setMenu(false)}>Templates</a><a href="#how-it-works" onClick={()=>setMenu(false)}>How it works</a><a href="#collaboration" onClick={()=>setMenu(false)}>Made for founders</a></nav><Link href="/studio" className="button small outline desktop-cta">Open studio <ArrowUpRight size={16}/></Link><button className="mobile-menu icon-button" onClick={()=>setMenu(!menu)} aria-label="Toggle menu">{menu ? <X/> : <Menu/>}</button></header>
 <div className="entrance-stage container">
   <div className="entrance-copy"><h1>YOU BUILD<br/>THE FUTURE.<br/><span>WE MAKE IT<br/>A FILM.</span></h1><p>Your ambition. Your story. A film that makes people feel it. <em>All on your browser.</em></p><div className="hero-actions"><Link href="/studio" className="button primary">Create your founder film <ArrowUpRight size={19}/></Link><button className="text-button" onClick={()=>setPreview('founder')}><span className="play-small"><Play size={13} fill="currentColor"/></span> Explore a template</button></div>
   </div>
   <div className="entrance-side">
     <ExampleFilm />
     <form className="byok-strip" onSubmit={(e)=>{e.preventDefault();void saveKey();}}>
       <label htmlFor="landing-openai-key"><KeyRound size={15}/><span>OpenAI API key</span></label>
       <div className="byok-row">
         <input id="landing-openai-key" type="password" autoComplete="off" spellCheck={false} placeholder="sk-..." value={openaiKey} onChange={(e)=>{setOpenaiKey(e.target.value);setKeyStatus('idle');setKeyError('');}} disabled={keyStatus==='checking'}/>
         <button type="submit" className="button small outline" disabled={keyStatus==='checking'||!openaiKey.trim()}>
           {keyStatus==='checking' ? 'Checking…' : keyStatus==='ok' ? <><Check size={14}/> Opening</> : 'Save'}
         </button>
       </div>
       <small style={keyError ? { color: '#ff8b84' } : undefined}>{keyError || 'Valid key → opens studio via WebMCP open_studio'}</small>
     </form>
   </div>
 </div></section>
 <section className="hero container"><div className="hero-copy"><div className="eyebrow"><span className="red-line"/> BIG IDEAS DESERVE GREAT FILMS</div><h2>From the first spark<br/>to the <span>final cut.</span></h2><p>Create alongside AI — human-directed, browser-native, built for founders with something to say.</p><div className="hero-footnote"><span className="status-dot"/> Browser-native. Human-directed. AI-powered.</div></div>
 <div className="hero-visual"><div className="visual-topline"><span>YOUR NEXT CHAPTER, ON SCREEN.</span><span>01 / 04</span></div><button className="hero-film" onClick={()=>setPreview('founder')} aria-label="Explore founder story template"><img src="https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=90" alt="Crowd and stage lights at a live event"/><div className="film-shade"/><div className="film-label"><span className="status-dot"/> A FOUNDER ORIGINAL</div><div className="film-title">EVERY BIG THING<br/>STARTS WITH<br/><em>A LITTLE CRAZY.</em></div><span className="play-large"><Play size={25} fill="currentColor"/></span><div className="film-bottom"><span>THE DEMO DAY PITCH</span><span>TEMPLATE PREVIEW <ArrowUpRight size={15}/></span></div></button><div className="visual-caption"><span><Film size={16}/> Your story, with a cinematic point of view.</span><span>16:9</span></div><div className="floating-note"><Sparkles size={17}/><div>Creative control. Always yours.<small>One workspace for you and your agent.</small></div></div></div></section>
 <div className="manifesto-strip"><div className="container"><span>FOR THE ONES WHO <b>BUILD.</b></span><span>WHO <b>DARE.</b></span><span>WHO HAVE A STORY <b>WORTH TELLING.</b></span><span className="red">LET’S MAKE IT SEEN. <ArrowUpRight size={19}/></span></div></div>
 <section id="templates" className="templates-section container"><div className="section-heading"><div><div className="eyebrow"><span className="red-line"/> SKIP THE BLANK CANVAS</div><h2>A starting point.<br/><span>For your next big moment.</span></h2></div><p>Find your format. Bring your perspective.<br/>Every template is a story waiting to be yours.</p></div><TemplateCards onSelect={setPreview}/></section>
 <section id="how-it-works" className="how-section container"><div className="section-heading"><div><div className="eyebrow"><span className="red-line"/> FROM STARTUP TO SCREEN</div><h2>Your story. Three acts.</h2></div><Link href="/studio" className="text-button">Step inside the studio <ArrowUpRight size={18}/></Link></div><div className="steps">{[{icon:Globe,title:'Bring your world.',text:'Start with your website, an idea, or a template. Give your story a place to begin.'},{icon:Sparkles,title:'Build it together.',text:'Shape your script and scenes alongside an AI creative partner. You call the shots.'},{icon:SlidersHorizontal,title:'Make it yours.',text:'Refine the details, find your rhythm, and turn a first draft into your founder film.'}].map((s,i)=><div className="step" key={s.title}><div className="step-top"><s.icon size={24}/><span>0{i+1}</span></div><h3>{s.title}</h3><p>{s.text}</p></div>)}</div></section>
 <section id="collaboration" className="collab container"><div><div className="eyebrow"><span className="red-line"/> HUMAN IMAGINATION. AGENT EXECUTION.</div><h2>YOU’RE THE DIRECTOR.<br/><span>AI IS YOUR CREW.</span></h2><p>A shared creative workspace where every idea becomes something you can see, change, and make your own.</p><Link href="/studio" className="button primary">Meet your studio <ArrowUpRight size={18}/></Link></div><Link href="/studio" className="studio-peek"><img src="/images/studio-reference.png" alt="Design preview of the three-panel Slush Filmmaker workspace" loading="lazy"/><span><MousePointer2 size={14}/> EXPLORE THE WORKSPACE <ArrowRight size={15}/></span></Link></section>
 <footer className="container"><Logo/><p>For founders with something to say.</p><span>© {new Date().getFullYear()} Slush Filmmaker · Hackathon project</span></footer>{preview && <Preview id={preview} close={()=>setPreview(null)} useTemplate={()=>window.location.href=`/studio?template=${preview}`}/>}</main>;
}
