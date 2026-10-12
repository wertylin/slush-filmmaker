'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  ArrowUpRight,
  Home,
  LayoutGrid,
  Folder,
  Image as ImageIcon,
  BookOpen,
  Settings2,
  Globe,
  Sparkles,
  Play,
  Check,
  Send,
  Film,
  ChevronRight,
  X,
  PanelLeftClose,
  PanelRightClose,
  Monitor,
  KeyRound,
  SlidersHorizontal,
  ChevronDown,
  Clapperboard,
  Upload,
} from 'lucide-react';
import { Logo, photos, TemplateCards, Preview } from '@/components/shared';
import { getCachedTemplates } from '@/lib/templates';
import { useWebMCP, callWebMCPTool } from '@/components/webmcp';
import { getFalKey, getOpenAIKey, setFalKey, setOpenAIKey, hasFalKey, hasOpenAIKey } from '@/components/keys';
import { chatWithSophie } from '@/components/sophie-chat';
import { SOPHIE_STARTER } from '@/prompts/sophie';
import { useStudioProject, type StudioTab } from '@/components/studio-actions';
import {
  EditorClipsPanel,
  EditorInspector,
  ProjectEditor,
  type PlaceTarget,
} from '@/components/project-editor';
import { addAssetSource, fetchBlocks, mergeAssetLibrary, readLocalSources, type Block } from '@/lib/blocks';
import {
  durableImageUrl,
  ingestMediaFile,
  pickMediaFiles,
  type IngestedMedia,
  type SlushAssetPayload,
} from '@/lib/ingest-media';

type ChatMsg = { id: string; role: 'user' | 'assistant' | 'system'; text: string };
const tabs = [
  { name: 'Overview' as const, icon: Home },
  { name: 'Templates' as const, icon: LayoutGrid },
  { name: 'Projects' as const, icon: Folder },
  { name: 'Editor' as const, icon: Clapperboard },
  { name: 'Assets' as const, icon: ImageIcon },
  { name: 'Docs' as const, icon: BookOpen },
];
const starterChat: ChatMsg[] = [{ id: 'm0', role: 'assistant', text: SOPHIE_STARTER }];

export default function Studio() {
  const studio = useStudioProject();
  const {
    scenes,
    setScenes,
    selected,
    setSelected,
    playhead,
    setPlayhead,
    tracks,
    template,
    website,
    setWebsite,
    project,
    setProject,
    activity,
    brief,
    pendingProposal,
    reviewOpen,
    setReviewOpen,
    openaiKey,
    agentified,
    syncKey,
    pushActivity,
    selectScene,
    setSceneImage,
    applySceneMedia,
    addGeneratedSource,
    chooseTemplate,
    getState,
    getTimeline,
    proposeTimelineEdits,
    setBrief,
    setPendingProposal,
    reviewProposal,
    applyProposal,
    dismissProposal,
    newProject,
    ready,
    bootOpenEditor,
  } = studio;

  const [tab, setTab] = useState<StudioTab>('Overview');
  const [preview, setPreview] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>(starterChat);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [falDraft, setFalDraft] = useState('');
  const [falConnected, setFalConnected] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [blocksTick, setBlocksTick] = useState(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [assetDragging, setAssetDragging] = useState(false);
  const assetFileRef = useRef<HTMLInputElement>(null);
  const assetDragDepth = useRef(0);

  useEffect(() => {
    setKeyDraft(openaiKey || getOpenAIKey());
    setFalDraft(getFalKey());
    setFalConnected(hasFalKey());
  }, [openaiKey]);

  useEffect(() => {
    setBlocks((prev) => mergeAssetLibrary(prev, readLocalSources()));
  }, []);

  useEffect(() => {
    if (tab !== 'Assets' && tab !== 'Editor') return;
    let cancelled = false;
    void fetchBlocks().then((rows) => {
      if (cancelled) return;
      setBlocks(mergeAssetLibrary(rows, readLocalSources()));
    });
    return () => {
      cancelled = true;
    };
  }, [tab, blocksTick]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/prompts/sophie_starter')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const body = data?.prompt?.body;
        if (!cancelled && typeof body === 'string' && body.trim()) {
          setChat((prev) =>
            prev.length === 1 && prev[0]?.id === 'm0'
              ? [{ id: 'm0', role: 'assistant', text: body }]
              : prev,
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreview(null);
        setSettings(false);
        setDetailsOpen(false);
        setReviewOpen(false);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [setReviewOpen]);

  const scene = scenes.find((s) => s.id === selected) || scenes[0];
  const sceneImage = scene?.image || photos.earth;
  const sceneTitle = scene?.title || 'No scene yet';
  const sceneCaption = scene?.caption || '';
  const sceneDuration = scene?.duration ?? 0;

  async function onChooseTemplate(id?: string) {
    setPreview(null);
    const result = await chooseTemplate(id);
    setTab('Editor');
    setNotice(`${result.project} ready in Editor.`);
  }

  useEffect(() => {
    if (!ready || !bootOpenEditor) return;
    setTab('Editor');
    setNotice('Template opened in Editor.');
  }, [ready, bootOpenEditor]);

  function seekTimeline(t: number) {
    const total = Math.max(0.001, scenes.reduce((n, s) => n + s.duration, 0));
    const clamped = Math.max(0, Math.min(total, t));
    setPlayhead(clamped);
    let acc = 0;
    for (const s of scenes) {
      if (clamped < acc + s.duration) {
        setSelected(s.id);
        break;
      }
      acc += s.duration;
    }
  }

  useWebMCP(
    {
      preview: setPreview,
      start: onChooseTemplate,
      getState: () => ({ ...getState(), tab }),
      getTimeline,
      proposeTimelineEdits,
      selectScene: (id) => {
        selectScene(id);
        setTab('Editor');
      },
      setWebsite,
      setBrief,
      setPendingProposal,
      reviewProposal,
      applyProposal,
      pushActivity,
      setNotice,
      openSettings: () => setSettings(true),
      setTab: (next) => {
        setTab(next);
        setLeftOpen(false);
      },
      newProject,
      setSceneImage,
      addGeneratedSource: async (input) => {
        const result = await addGeneratedSource(input);
        if (result.source) {
          setBlocks((prev) => mergeAssetLibrary(prev, [result.source, ...readLocalSources()]));
        }
        setBlocksTick((n) => n + 1);
        setTab('Assets');
        return result;
      },
    },
    agentified,
  );

  async function startWebsite() {
    if (!hasOpenAIKey() && !openaiKey.trim()) {
      setSettings(true);
      setNotice('Connect your OpenAI key to analyze a website.');
      return;
    }
    try {
      const url = new URL(website.startsWith('http') ? website : `https://${website}`);
      if (!url.hostname.includes('.')) throw new Error('invalid');
      setAnalyzeBusy(true);
      setWebsite(url.href);
      setProject(url.hostname.replace(/^www\./, '') + ' — Founder film');
      const result = (await callWebMCPTool('analyze_website', { url: url.href })) as {
        brief?: { product?: string };
      };
      if (result?.brief?.product) {
        setNotice(`Brief ready: ${result.brief.product}`);
      }
      setTab('Overview');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      if (msg === 'byok_required') {
        setSettings(true);
        setNotice('Connect your OpenAI key to analyze a website.');
      } else {
        setNotice(msg.includes('valid') ? 'Enter a valid website, for example yourstartup.com.' : msg);
      }
    } finally {
      setAnalyzeBusy(false);
    }
  }

  function placeAssetOnTrack(asset: SlushAssetPayload, target?: PlaceTarget) {
    const trackId = target?.trackId || 'broll';
    const start = target?.start ?? playhead;
    const duration = Math.max(1, Math.min(60, Number(asset.duration) || 6));
    try {
      proposeTimelineEdits({
        plan: `Place “${asset.description}” on ${trackId}`,
        ops: [
          {
            op: 'upsert_clip',
            trackId,
            clip: {
              label: asset.description,
              start,
              duration,
              image: asset.image,
              video: asset.video,
            },
          },
        ],
      });
      setNotice(`“${asset.description}” → ${trackId} @ ${start.toFixed(1)}s`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not place asset');
    }
  }

  async function placeMediaOnTrack(media: IngestedMedia, target?: PlaceTarget) {
    const trackId = target?.trackId || 'broll';
    const start = target?.start ?? playhead;
    const label = media.fileName.replace(/\.[^.]+$/, '') || media.fileName;
    const duration = Math.max(1, Math.min(60, Number(media.durationHint) || 6));
    try {
      const image = await durableImageUrl(media.imageUrl);
      const source = await addAssetSource({
        image,
        description: label,
        caption: media.kind === 'video' ? `Uploaded video · ${media.fileName}` : `Uploaded · ${media.fileName}`,
        duration,
        prompt: label,
      });
      setBlocks((prev) => mergeAssetLibrary(prev, [source, ...readLocalSources()]));
      setBlocksTick((n) => n + 1);
      proposeTimelineEdits({
        plan: `Place “${label}” on ${trackId}`,
        ops: [
          {
            op: 'upsert_clip',
            trackId,
            clip: {
              label,
              start,
              duration,
              image,
              video: media.videoUrl,
            },
          },
        ],
      });
      setNotice(`“${label}” → ${trackId} @ ${start.toFixed(1)}s`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not place media');
    }
  }

  async function uploadAssetFiles(fileList: FileList | File[] | null | undefined) {
    const files = pickMediaFiles(fileList);
    if (!files.length) {
      setNotice('Pick an image or video file');
      return;
    }
    setUploadBusy(true);
    try {
      let added = 0;
      for (const file of files) {
        const media = await ingestMediaFile(file);
        const image = await durableImageUrl(media.imageUrl);
        const label = media.fileName.replace(/\.[^.]+$/, '') || media.fileName;
        const source = await addAssetSource({
          image,
          description: label,
          caption: media.kind === 'video' ? `Uploaded video · ${media.fileName}` : `Uploaded · ${media.fileName}`,
          duration: media.durationHint,
          prompt: label,
        });
        setBlocks((prev) => mergeAssetLibrary(prev, [source, ...readLocalSources()]));
        added += 1;
      }
      setBlocksTick((n) => n + 1);
      setNotice(added === 1 ? 'Source added to Assets.' : `${added} sources added to Assets.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadBusy(false);
      if (assetFileRef.current) assetFileRef.current.value = '';
    }
  }

  function onAssetDragEnter(e: DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    assetDragDepth.current += 1;
    setAssetDragging(true);
  }

  function onAssetDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onAssetDragLeave(e: DragEvent) {
    e.preventDefault();
    assetDragDepth.current = Math.max(0, assetDragDepth.current - 1);
    if (assetDragDepth.current === 0) setAssetDragging(false);
  }

  function onAssetDrop(e: DragEvent) {
    e.preventDefault();
    assetDragDepth.current = 0;
    setAssetDragging(false);
    void uploadAssetFiles(e.dataTransfer.files);
  }

  async function send() {
    const text = message.trim();
    if (!text || chatBusy) return;
    const key = getOpenAIKey() || openaiKey.trim();
    if (!key) {
      setSettings(true);
      setNotice('Connect your OpenAI key to chat with Sophie.');
      return;
    }
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', text };
    const history = chat
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }));
    setChat((c) => [...c, userMsg]);
    setMessage('');
    setChatBusy(true);
    pushActivity(`You: ${text}`);
    try {
      const snap = getState();
      const reply = await chatWithSophie({
        key,
        history,
        userText: text,
        studioState: {
          project: snap.project,
          template: snap.template,
          website: snap.website,
          selectedSceneId: snap.selectedSceneId,
          scenes: snap.scenes.map(({ id, title, duration, caption }) => ({ id, title, duration, caption })),
          activity: snap.activity,
          brief: snap.brief,
          pendingProposal: snap.pendingProposal,
          agentified: snap.agentified,
          falConnected: snap.falConnected,
          tab,
        },
        actions: {
          getState: () => ({ ...getState(), tab }),
          getTimeline,
          proposeTimelineEdits,
          preview: setPreview,
          selectScene: (id) => {
            selectScene(id);
            setTab('Editor');
          },
          start: onChooseTemplate,
          setWebsite,
          setBrief,
          setPendingProposal,
          reviewProposal,
          applyProposal,
          pushActivity,
          setNotice,
          setTab: (next) => {
            setTab(next);
            setLeftOpen(false);
          },
          newProject,
          setSceneImage,
          openSettings: () => setSettings(true),
        },
      });
      setChat((c) => [...c, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
      pushActivity(`Sophie: ${reply.slice(0, 120)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chat failed';
      setChat((c) => [...c, { id: `a-${Date.now()}`, role: 'assistant', text: `Couldn’t reach OpenAI — ${msg}` }]);
      if (/invalid|401|key|byok/i.test(msg)) setSettings(true);
    } finally {
      setChatBusy(false);
    }
  }

  function saveConnection() {
    setOpenAIKey(keyDraft);
    setFalKey(falDraft);
    const falOk = falDraft.trim().length >= 16;
    setFalConnected(falOk);
    syncKey(keyDraft.trim());
    setSettings(false);
    const parts = [
      keyDraft.trim() ? 'OpenAI' : '',
      falOk ? 'fal.ai' : '',
    ].filter(Boolean);
    setNotice(parts.length ? `${parts.join(' + ')} saved in this browser.` : 'API keys cleared.');
    pushActivity(
      parts.length
        ? `Connected: ${parts.join(' + ')}.${keyDraft.trim() ? ' Agent tools unlocked.' : ''}`
        : 'API keys cleared.',
    );
  }

  const inEditor = tab === 'Editor';

  return (
    <div className={`studio-shell ${inEditor ? 'editor-mode' : ''}`}>
      <aside className={`left-sidebar ${inEditor ? 'editor-left' : ''} ${leftOpen ? 'visible' : ''}`}>
        <Logo />
        <div className="workspace-tag">
          <span className="status-dot" /> YOUR CREATIVE SPACE
        </div>
        <nav className="side-nav">
          {tabs.map((t) => (
            <button
              key={t.name}
              className={tab === t.name ? 'active' : ''}
              onClick={() => {
                setTab(t.name as StudioTab);
                setLeftOpen(false);
              }}
            >
              <t.icon size={19} />
              {t.name}
              {t.name === 'Projects' && <span className="nav-count">1</span>}
            </button>
          ))}
        </nav>
        {inEditor && (
          <>
            <button type="button" className="editor-project-chip" onClick={() => setTab('Projects')}>
              <img src={scenes[0]?.image || photos.earth} alt="" />
              <span>
                <b>{project}</b>
                <small>{scenes.length} scenes · local</small>
              </span>
            </button>
            <EditorClipsPanel
              assets={blocks}
              scenes={scenes}
              selected={selected}
              tracks={tracks}
              onNotice={setNotice}
              onApplyAsset={placeAssetOnTrack}
              onPlaceMedia={placeMediaOnTrack}
            />
          </>
        )}
        <div className="sidebar-bottom">
          {!inEditor && (
            <div className="sidebar-promo">
              <img src={photos.stage} alt="Red stage lights" />
              <div>
                <span className="eyebrow">BUILT FOR THE BOLD</span>
                <h3>
                  Ideas deserve
                  <br />
                  an audience.
                </h3>
                <Link href="/">
                  Explore Slush Filmmaker <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          )}
          <button className="workspace-user" onClick={() => setSettings(true)}>
            <span className="user-avatar">Y</span>
            <span>
              Your workspace
              <small>{agentified ? 'Agentified · auto-saved' : 'Local demo · auto-saved'}</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>

      <div className={`studio-main ${inEditor ? 'editor-mode-main' : ''}`}>
        <header className={`studio-topbar ${inEditor ? 'editor-hidden' : ''}`}>
          <button className="icon-button sidebar-toggle" onClick={() => setLeftOpen(!leftOpen)} aria-label="Toggle navigation">
            <PanelLeftClose size={19} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <b>{tab}</b>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">{agentified ? 'AGENTIFIED' : 'DEMO WORKSPACE'}</span>
            <Link href="/" className="icon-button" aria-label="Back to landing">
              <ArrowUpRight size={18} />
            </Link>
            <button className="icon-button" onClick={() => setRightOpen(!rightOpen)} aria-label="Toggle agent panel">
              <PanelRightClose size={18} />
            </button>
          </div>
        </header>

        <div className={`studio-content ${inEditor ? 'editor-fill' : ''}`}>
          {tab === 'Overview' && (
            <>
              <section className="studio-hero">
                <img className="studio-hero-bg" src={photos.stage} alt="" />
                <div className="eyebrow">
                  <span className="status-dot" /> YOUR VISION. YOUR DIRECTOR’S CHAIR.
                </div>
                <h1>
                  Turn your startup
                  <br />
                  into a <span>founder film.</span>
                </h1>
                <p>
                  Bring your big idea. Find your story.
                  <br />
                  Make something worth watching, together with AI.
                </p>
                <div className="studio-hero-actions">
                  <button className="button primary" onClick={() => document.getElementById('website')?.focus()}>
                    <Sparkles size={17} /> Start with your website <ArrowUpRight size={17} />
                  </button>
                  <button className="button outline" onClick={() => setPreview(template)}>
                    <Play size={15} /> Explore template
                  </button>
                </div>
              </section>

              <section className="editor-panel">
                <div className="editor-toolbar">
                  <span className="traffic-lights">
                    <i />
                    <i />
                    <i />
                  </span>
                  <div className="url-input">
                    <Globe size={16} />
                    <input
                      id="website"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://yourstartup.com"
                      onKeyDown={(e) => e.key === 'Enter' && void startWebsite()}
                      disabled={analyzeBusy}
                    />
                  </div>
                  <button className="button small outline-red" onClick={() => void startWebsite()} disabled={analyzeBusy}>
                    {analyzeBusy ? 'Analyzing…' : 'Use website'} <ArrowRightIcon />
                  </button>
                </div>
                <div className="editor-title">
                  <div>
                    <span className="eyebrow">STORYBOARD / {getCachedTemplates().find((t) => t.id === template)?.category || 'STORY'}</span>
                    <input aria-label="Project name" value={project} onChange={(e) => setProject(e.target.value)} />
                  </div>
                  <span className="demo-badge">{brief ? 'BRIEF READY' : 'EDITABLE DEMO'}</span>
                </div>
                <div className="scene-preview">
                  <img src={sceneImage} alt={sceneTitle} />
                  <div className="scene-gradient" />
                  <span className="frame-label">
                    SCENE{' '}
                    {String((scene ? scenes.indexOf(scene) : -1) + 1).padStart(2, '0')} /{' '}
                    {String(scenes.length).padStart(2, '0')}
                  </span>
                  <div className="scene-caption">{sceneCaption}</div>
                  <div className="preview-controls">
                    <span>
                      <Monitor size={15} /> 16:9 · Storyboard preview
                    </span>
                    <span>{sceneDuration}s</span>
                  </div>
                </div>
                <div className="scene-strip">
                  {scenes.map((s, i) => (
                    <button className={selected === s.id ? 'selected' : ''} key={s.id} onClick={() => setSelected(s.id)}>
                      <img src={s.image} alt={s.title} />
                      <span>
                        {String(i + 1).padStart(2, '0')} · {s.duration}s
                      </span>
                    </button>
                  ))}
                </div>
                <div className="scene-edit">
                  <label>
                    SCENE CAPTION
                    <input
                      value={sceneCaption}
                      disabled={!scene}
                      onChange={(e) => {
                        if (!scene) return;
                        setScenes((all) => all.map((s) => (s.id === scene.id ? { ...s, caption: e.target.value } : s)));
                      }}
                    />
                  </label>
                  <label className="duration-edit">
                    SECONDS
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={sceneDuration || ''}
                      disabled={!scene}
                      onChange={(e) => {
                        if (!scene) return;
                        setScenes((all) =>
                          all.map((s) =>
                            s.id === scene.id
                              ? { ...s, duration: Math.max(1, Math.min(60, Number(e.target.value) || 1)) }
                              : s,
                          ),
                        );
                      }}
                    />
                  </label>
                </div>
                <div className="editor-footer">
                  <span>
                    <span className="status-dot" /> Saved on this device
                  </span>
                  <span>
                    {scenes.length} scenes · {scenes.reduce((n, s) => n + s.duration, 0)} seconds
                    {pendingProposal ? ' · proposal pending' : ''}
                  </span>
                </div>
              </section>

              <div className="onboarding-steps">
                {[
                  { title: 'Bring your story', text: 'A website, an idea, a spark.', icon: Globe },
                  { title: 'Choose your direction', text: 'A template that feels like you.', icon: Film },
                  { title: 'Create together', text: 'Your vision, an AI creative crew.', icon: Sparkles },
                ].map((s, i) => (
                  <button
                    key={s.title}
                    onClick={() =>
                      i === 0
                        ? document.getElementById('website')?.focus()
                        : i === 1
                          ? setTab('Templates')
                          : setRightOpen(true)
                    }
                  >
                    <span className="step-circle">{i + 1}</span>
                    <div>
                      <h4>{s.title}</h4>
                      <p>{s.text}</p>
                    </div>
                    <s.icon size={19} />
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === 'Templates' && (
            <section className="dashboard-section">
              <div className="eyebrow">FIND YOUR FORMAT</div>
              <h1>A story for every moment.</h1>
              <p>Pick a starting point. Make it unmistakably yours.</p>
              <TemplateCards onSelect={setPreview} />
            </section>
          )}

          {tab === 'Projects' && (
            <section className="dashboard-section">
              <div className="eyebrow">YOUR WORK</div>
              <h1>Stories in the making.</h1>
              <button className="project-card" onClick={() => setTab('Editor')}>
                <img src={scenes[0]?.image || photos.earth} alt="Project cover" />
                <div>
                  <h3>{project}</h3>
                  <p>
                    {scenes.length} scenes · Saved on this device
                  </p>
                </div>
                <ArrowUpRight />
              </button>
            </section>
          )}

          {tab === 'Editor' && (
            <ProjectEditor
              project={project}
              scenes={scenes}
              selected={selected}
              playhead={playhead}
              tracks={tracks}
              onSelect={selectScene}
              onSeek={seekTimeline}
              onProjectChange={setProject}
              onNotice={setNotice}
              onApplyAsset={(asset, sceneId) => {
                const target =
                  (sceneId ? scenes.find((s) => s.id === sceneId) : null) ||
                  scenes.find((s) => s.id === selected) ||
                  scenes[0];
                if (!target) {
                  setNotice('No scene to apply media to.');
                  return;
                }
                setSceneImage(target.id, asset.image);
                selectScene(target.id);
                setNotice(`“${asset.description}” → ${target.title}.`);
              }}
              onReplaceMedia={async (media) => {
                const target = scenes.find((s) => s.id === selected) || scenes[0];
                if (!target) {
                  setNotice('No scene to apply media to.');
                  return;
                }
                try {
                  const result = await applySceneMedia({
                    sceneId: target.id,
                    imageUrl: media.imageUrl,
                    videoUrl: media.videoUrl,
                    label: media.fileName,
                    durationHint: media.durationHint,
                  });
                  if (result.source) {
                    setBlocks((prev) => mergeAssetLibrary(prev, [result.source, ...readLocalSources()]));
                    setBlocksTick((n) => n + 1);
                  }
                  setNotice(
                    media.kind === 'video'
                      ? `Video applied to ${target.title} (poster saved to Assets).`
                      : `Image applied to ${target.title}.`,
                  );
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : 'Replace failed');
                }
              }}
              onTimelineOps={(ops, plan) => {
                try {
                  proposeTimelineEdits({ plan, ops });
                  setNotice('Timeline updated.');
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : 'Timeline edit failed');
                }
              }}
            />
          )}

          {tab === 'Assets' && (
            <section className="dashboard-section">
              <div className="eyebrow">YOUR VISUAL WORLD</div>
              <div className="asset-header">
                <h1>Assets.</h1>
                <button
                  type="button"
                  className="asset-upload-btn"
                  disabled={uploadBusy}
                  onClick={() => assetFileRef.current?.click()}
                >
                  <Upload size={16} />
                  {uploadBusy ? 'Uploading…' : 'Upload'}
                </button>
              </div>
              <p>
                Drop your own stills or video here, or let Sophie generate. Tap a card to put it on the selected scene —
                generate never overwrites a slot.
                {!falConnected ? ' Connect fal.ai when you want Sophie to grow the library.' : ''}
              </p>
              <input
                ref={assetFileRef}
                type="file"
                accept="image/*,video/*,.png,.jpg,.jpeg,.gif,.webp,.avif,.mp4,.webm,.mov"
                multiple
                hidden
                onChange={(e) => void uploadAssetFiles(e.target.files)}
              />
              <div
                className={`asset-grid${assetDragging ? ' is-drop-target' : ''}${uploadBusy ? ' is-ingest' : ''}`}
                onDragEnter={onAssetDragEnter}
                onDragOver={onAssetDragOver}
                onDragLeave={onAssetDragLeave}
                onDrop={onAssetDrop}
              >
                <button
                  type="button"
                  className="asset-upload-tile"
                  disabled={uploadBusy}
                  onClick={() => assetFileRef.current?.click()}
                >
                  <span className="asset-upload-tile-body">
                    <Upload size={22} />
                    <strong>{uploadBusy ? 'Reading media…' : assetDragging ? 'Drop to add' : 'Upload media'}</strong>
                    <em>Image or video</em>
                  </span>
                </button>
                {(blocks.length
                  ? blocks
                  : scenes.map((s) => ({
                      id: s.id,
                      key: s.id,
                      image: s.image,
                      description: s.title,
                      caption: s.caption,
                      duration: s.duration,
                      sortOrder: 0,
                    }))
                ).map((b) => {
                  const inUse = scenes.some((s) => s.image === b.image);
                  const isGenerated = String(b.key || '').startsWith('source-');
                  return (
                    <button
                      key={b.id || b.key}
                      type="button"
                      onClick={() => {
                        const target = scenes.find((s) => s.id === selected) || scenes[0];
                        if (target) {
                          setSceneImage(target.id, b.image);
                          selectScene(target.id);
                          setNotice(`Source dropped on ${target.title}.`);
                        }
                        setTab('Editor');
                      }}
                    >
                      <img src={b.image} alt={b.description} />
                      <span>
                        <span className="asset-meta">
                          {b.description}
                          {isGenerated ? <em className="asset-tag">new</em> : null}
                          {inUse ? <em className="asset-tag on">on timeline</em> : null}
                        </span>
                        <ArrowUpRight size={16} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {tab === 'Docs' && (
            <section className="dashboard-section docs">
              <div className="eyebrow">A LITTLE DIRECTION</div>
              <h1>Welcome to your studio.</h1>
              <h3>01 — Make yourself at home</h3>
              <p>
                Explore templates, rename your project, and edit scene captions and durations. Your project is saved in
                this browser.
              </p>
              <h3>02 — Paste a key to agentify</h3>
              <p>
                Connect an OpenAI key to unlock Sophie chat and WebMCP story tools. Add fal.ai for
                generate_scene_image. Human and agent share the same workspace.
              </p>
              <h3>03 — What’s live vs next</h3>
              <p>
                Live: website brief → storyboard → stills (fal.ai) → Editor Export (WebM montage). Video gen / multi-track
                mix is next.
              </p>
            </section>
          )}

          {!inEditor && (
            <div className="studio-bottom-note">
              MADE FOR FOUNDERS. BUILT FOR THE FIRST TAKE. <span>SLUSH FILMMAKER</span>
            </div>
          )}
        </div>
      </div>

      <aside className={`right-sidebar ${rightOpen ? 'visible' : ''}`}>
        <div className="agent-header">
          <div className="agent-avatar">
            <img src={photos.agent} alt="Sophie assistant avatar" />
            <span className="status-dot" />
          </div>
          <div>
            <h3>
              Sophie <span>AI</span>
            </h3>
            <p>{agentified ? 'Agentified partner' : 'Creative partner'}</p>
          </div>
          <div className="agent-header-actions">
            <button
              className={`icon-button ${detailsOpen ? 'active' : ''}`}
              onClick={() => setDetailsOpen((v) => !v)}
              aria-label="Toggle details"
              aria-expanded={detailsOpen}
            >
              <SlidersHorizontal size={16} />
            </button>
            <button className="icon-button" onClick={() => setSettings(true)} aria-label="Agent settings">
              <Settings2 size={17} />
            </button>
          </div>
        </div>

        {inEditor && scene && (
          <EditorInspector scene={scene} sceneIndex={scenes.indexOf(scene)} sceneCount={scenes.length} />
        )}

        {detailsOpen && (
          <div className="agent-details">
            <button className="details-toggle" onClick={() => setDetailsOpen(false)}>
              Details <ChevronDown size={14} />
            </button>
            <div className="connection-card">
              <div className="panel-heading">
                <h4>Connections</h4>
                <button onClick={() => setSettings(true)}>
                  Manage <ArrowUpRight size={12} />
                </button>
              </div>
              {[
                { name: 'OpenAI', ok: agentified, desc: 'Story & agentify tools' },
                { name: 'fal.ai', ok: falConnected, desc: 'Image & video generation' },
              ].map((c, i) => (
                <button className="connection-row" key={c.name} onClick={() => setSettings(true)}>
                  {i === 0 ? <Sparkles size={22} /> : <span className="fal-mark">f</span>}
                  <span>
                    <b>{c.name}</b>
                    <small>{c.desc}</small>
                  </span>
                  <span className={c.ok ? 'connection-on' : 'connection-off'} />
                </button>
              ))}
              <div className="connection-note">
                <KeyRound size={12} />
                {agentified && falConnected
                  ? 'OpenAI + fal.ai saved in this browser'
                  : agentified
                    ? 'OpenAI ready — add fal.ai for generation'
                    : falConnected
                      ? 'fal.ai ready — add OpenAI to agentify'
                      : 'Connect OpenAI to agentify this studio'}
              </div>
            </div>
            {pendingProposal && (
              <div className="activity-panel">
                <div className="panel-heading">
                  <h4>Pending proposal</h4>
                  <button onClick={() => setReviewOpen(true)}>Review</button>
                </div>
                <p className="proposal-summary">{pendingProposal.diffSummary}</p>
              </div>
            )}
            <div className="activity-panel">
              <div className="panel-heading">
                <h4>Creative activity</h4>
                <span className="demo-badge">LOCAL</span>
              </div>
              <div className="activity-list">
                {activity.map((a, i) => (
                  <div className="activity" key={i}>
                    <span className="activity-dot">{i === 0 ? <Sparkles size={12} /> : <Check size={12} />}</span>
                    <div>
                      <p>{a}</p>
                      <small>{i === 0 ? 'Ready when you are' : 'This session'}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="agent-chat" aria-live="polite">
          {chat.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.role}`}>
              {m.role === 'assistant' && <img src={photos.agent} alt="" className="chat-avatar" />}
              <div className="chat-bubble-body">
                <p>{m.text}</p>
              </div>
            </div>
          ))}
          {chatBusy && (
            <div className="chat-bubble assistant">
              <img src={photos.agent} alt="" className="chat-avatar" />
              <div className="chat-bubble-body chat-typing">
                <p>Thinking…</p>
              </div>
            </div>
          )}
        </div>

        <div className="agent-composer">
          {!agentified && !detailsOpen && (
            <button type="button" className="agent-connect-chip" onClick={() => setSettings(true)}>
              <KeyRound size={12} /> Connect OpenAI to agentify
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={agentified ? 'Message Sophie…' : 'Connect OpenAI to chat…'}
              aria-label="Message Sophie"
              disabled={chatBusy}
            />
            <button aria-label="Send message" disabled={chatBusy || !message.trim()}>
              <Send size={17} />
            </button>
          </form>
        </div>
      </aside>

      {preview && <Preview id={preview} close={() => setPreview(null)} useTemplate={() => onChooseTemplate(preview)} />}

      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="API connections"
            onClick={(e) => e.stopPropagation()}
          >
            <button autoFocus className="close icon-button" aria-label="Close connections" onClick={() => setSettings(false)}>
              <X />
            </button>
            <span className="eyebrow">YOUR CREATIVE CREW</span>
            <h2>Bring your own keys.</h2>
            <p>
              OpenAI agentifies Sophie + WebMCP story tools. fal.ai is for image & video gen. Keys stay in this
              browser only.
            </p>
            <label className="settings-field">
              OpenAI API key
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-..."
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
              />
            </label>
            <label className="settings-field">
              fal.ai API key
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="fal-… or key:secret"
                value={falDraft}
                onChange={(e) => setFalDraft(e.target.value)}
              />
            </label>
            <div className="settings-info">
              <KeyRound size={22} />
              <p>
                {keyDraft.trim() && falDraft.trim()
                  ? 'Both keys ready. OpenAI unlocks Sophie; fal.ai unlocks generate_scene_image.'
                  : keyDraft.trim()
                    ? 'OpenAI unlocks Sophie + story tools. Add fal.ai to generate stills.'
                    : falDraft.trim()
                      ? 'fal.ai saved — still need OpenAI to agentify Sophie.'
                      : 'Optional BYOK. Leave blank to keep exploring the demo.'}
              </p>
            </div>
            <button className="button primary" onClick={saveConnection}>
              Save connections <ArrowUpRight size={17} />
            </button>
          </section>
        </div>
      )}

      {reviewOpen && pendingProposal && (
        <div className="modal-backdrop" onClick={() => setReviewOpen(false)}>
          <section
            className="modal settings-modal proposal-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Review storyboard proposal"
            onClick={(e) => e.stopPropagation()}
          >
            <button autoFocus className="close icon-button" aria-label="Close proposal" onClick={() => setReviewOpen(false)}>
              <X />
            </button>
            <span className="eyebrow">PENDING PROPOSAL · {pendingProposal.proposalId}</span>
            <h2>Review storyboard</h2>
            <p>{pendingProposal.diffSummary}</p>
            {pendingProposal.projectTitle && (
              <p className="proposal-title">
                Proposed title: <b>{pendingProposal.projectTitle}</b>
              </p>
            )}
            <div className="proposal-diff">
              {pendingProposal.scenes.map((ps, i) => {
                const current = scenes[i];
                return (
                  <div className="proposal-row" key={ps.id}>
                    <div>
                      <small>NOW {current ? current.title : '—'}</small>
                      <p>{current?.caption || 'No scene'}</p>
                    </div>
                    <ChevronRight size={16} />
                    <div>
                      <small>
                        NEW {ps.title} · {ps.duration}s
                      </small>
                      <p>{ps.caption}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="proposal-actions">
              <button className="button outline" onClick={dismissProposal}>
                Dismiss
              </button>
              <button
                className="button primary"
                onClick={() => {
                  try {
                    applyProposal(pendingProposal.proposalId);
                    setNotice('Storyboard proposal applied.');
                  } catch (err) {
                    setNotice(err instanceof Error ? err.message : 'Apply failed');
                  }
                }}
              >
                Apply proposal <ArrowUpRight size={17} />
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button className="icon-button" aria-label="Dismiss" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ArrowRightIcon() {
  return <ArrowUpRight size={14} />;
}
