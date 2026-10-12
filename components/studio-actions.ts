'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTemplateAvailable, photos, templates } from '@/components/shared';
import { getOpenAIKey, hasFalKey, hasOpenAIKey } from '@/components/keys';
import {
  applyTimelineOps,
  buildInitialTracks,
  buildTimelineSnapshot,
  parseTimelineOps,
  syncDerivedTracks,
  type TimelineOp,
  type TimelineTrack,
} from '@/components/timeline';
import { syncBlockImage } from '@/lib/blocks';
import {
  ensureRemoteProject,
  loadRemoteProject,
  saveRemoteProject,
  setStoredProjectId,
} from '@/lib/project-sync';

export type Scene = {
  id: string;
  title: string;
  image: string;
  duration: number;
  caption: string;
};

export type WebsiteBrief = {
  url: string;
  product: string;
  audience: string;
  tone: string;
  claims: string[];
  sources: string[];
  uncertain: string[];
  fetchedTextPreview?: string;
};

export type ProposalScene = {
  id: string;
  title: string;
  caption: string;
  duration: number;
};

export type StoryboardProposal = {
  proposalId: string;
  templateId: string;
  projectTitle?: string;
  scenes: ProposalScene[];
  diffSummary: string;
  brief?: WebsiteBrief | Record<string, unknown> | string;
};

export type StudioTab = 'Overview' | 'Templates' | 'Projects' | 'Editor' | 'Assets' | 'Docs';

export const STUDIO_TABS: StudioTab[] = ['Overview', 'Templates', 'Projects', 'Editor', 'Assets', 'Docs'];

export type StudioStateSnapshot = {
  project: string;
  template: string;
  scenes: Scene[];
  selectedSceneId: string;
  website: string;
  activity: string[];
  brief: WebsiteBrief | null;
  pendingProposal: StoryboardProposal | null;
  hasByok: boolean;
  agentified: boolean;
  falConnected: boolean;
  mode: 'local-demo';
  tab?: StudioTab;
  playhead?: number;
  timeline?: ReturnType<typeof buildTimelineSnapshot>;
};

export const INITIAL_SCENES: Scene[] = [
  { id: 'scene-1', title: 'The spark', image: photos.earth, duration: 6, caption: 'Every great company starts with a question.' },
  { id: 'scene-2', title: 'The founder', image: photos.founder, duration: 8, caption: 'What if we could build something better?' },
  { id: 'scene-3', title: 'The people', image: photos.team, duration: 7, caption: 'A shared belief. An extraordinary team.' },
  { id: 'scene-4', title: 'The vision', image: photos.product, duration: 6, caption: 'Built for a world that’s ready for more.' },
  { id: 'scene-5', title: 'The next chapter', image: photos.stage, duration: 5, caption: 'And this is only the beginning.' },
];

const STORAGE = 'slush-studio';

function mergeProposalScenes(current: Scene[], proposed: ProposalScene[]): Scene[] {
  const images = current.map((s) => s.image);
  return proposed.map((p, i) => ({
    id: p.id || `scene-${i + 1}`,
    title: p.title,
    caption: p.caption,
    duration: Math.max(1, Math.min(60, Number(p.duration) || 6)),
    image: images[i] || photos.earth,
  }));
}

export function useStudioProject() {
  const [scenes, setScenes] = useState<Scene[]>(INITIAL_SCENES);
  const [selected, setSelected] = useState('scene-1');
  const [playhead, setPlayhead] = useState(0);
  const [tracks, setTracks] = useState<TimelineTrack[]>(() => buildInitialTracks(INITIAL_SCENES));
  const [template, setTemplate] = useState('founder');
  const [website, setWebsite] = useState('');
  const [project, setProject] = useState('Untitled founder film');
  const [activity, setActivity] = useState<string[]>(['Studio opened. Your creative space is ready.']);
  const [brief, setBrief] = useState<WebsiteBrief | null>(null);
  const [pendingProposal, setPendingProposal] = useState<StoryboardProposal | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [openaiKey, setOpenaiKey] = useState('');
  const [agentified, setAgentified] = useState(false);

  const pendingRef = useRef<StoryboardProposal | null>(null);
  const scenesRef = useRef(scenes);
  const projectRef = useRef(project);
  const tracksRef = useRef(tracks);
  const selectedRef = useRef(selected);
  const playheadRef = useRef(playhead);
  scenesRef.current = scenes;
  projectRef.current = project;
  tracksRef.current = tracks;
  selectedRef.current = selected;
  playheadRef.current = playhead;

  const pushActivity = useCallback((text: string) => {
    setActivity((a) => [...a, text]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let hydrated = false;
      try {
        const remote = await loadRemoteProject();
        if (!cancelled && remote && Array.isArray(remote.payload.scenes) && remote.payload.scenes.length) {
          const scenesData = remote.payload.scenes as Scene[];
          setScenes(scenesData);
          setSelected(scenesData[0].id);
          setProject(remote.payload.title);
          setWebsite(remote.payload.website);
          setTemplate(isTemplateAvailable(remote.payload.template) ? remote.payload.template : 'founder');
          setTracks(
            Array.isArray(remote.payload.tracks) && remote.payload.tracks.length
              ? syncDerivedTracks(remote.payload.tracks as TimelineTrack[], scenesData)
              : buildInitialTracks(scenesData),
          );
          setPlayhead(remote.payload.playhead);
          if (remote.payload.brief) setBrief(remote.payload.brief as WebsiteBrief);
          if (remote.payload.pendingProposal) {
            const p = remote.payload.pendingProposal as unknown as StoryboardProposal;
            pendingRef.current = p;
            setPendingProposal(p);
          }
          hydrated = true;
        }
      } catch {
        /* fall through to localStorage */
      }
      if (!hydrated) {
        try {
          const saved = localStorage.getItem(STORAGE);
          if (saved) {
            const data = JSON.parse(saved) as {
              scenes?: Scene[];
              project?: string;
              website?: string;
              brief?: WebsiteBrief | null;
              pendingProposal?: StoryboardProposal | null;
              playhead?: number;
              tracks?: TimelineTrack[];
            };
            if (Array.isArray(data.scenes) && data.scenes.length) {
              setScenes(data.scenes);
              setSelected(data.scenes[0].id);
              setProject(data.project || 'Untitled founder film');
              setWebsite(data.website || '');
              setTracks(
                Array.isArray(data.tracks) && data.tracks.length
                  ? syncDerivedTracks(data.tracks, data.scenes)
                  : buildInitialTracks(data.scenes),
              );
              if (typeof data.playhead === 'number') setPlayhead(data.playhead);
            }
            if (data.brief) setBrief(data.brief);
            if (data.pendingProposal) {
              pendingRef.current = data.pendingProposal;
              setPendingProposal(data.pendingProposal);
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      const key = getOpenAIKey();
      setOpenaiKey(key);
      setAgentified(Boolean(key));
      const tid = new URLSearchParams(window.location.search).get('template');
      if (tid && isTemplateAvailable(tid)) setTemplate(tid);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setTracks((t) => syncDerivedTracks(t, scenes));
  }, [scenes, ready]);

  useEffect(() => {
    if (!ready) return;
    const snapshot = { scenes, project, website, brief, pendingProposal, playhead, tracks };
    localStorage.setItem(STORAGE, JSON.stringify(snapshot));

    const payload = {
      title: project,
      template,
      website,
      brief: (brief as unknown as Record<string, unknown>) ?? null,
      scenes,
      tracks,
      playhead,
      pendingProposal: (pendingProposal as unknown as Record<string, unknown>) ?? null,
    };
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const id = await ensureRemoteProject(payload);
          if (id) await saveRemoteProject(id, payload);
        } catch {
          /* offline / db down — localStorage still has it */
        }
      })();
    }, 800);
    return () => window.clearTimeout(t);
  }, [scenes, project, website, brief, pendingProposal, playhead, tracks, template, ready]);

  const selectScene = useCallback(
    (id: string) => {
      if (!scenes.some((s) => s.id === id)) throw new Error('Scene not found');
      setSelected(id);
      let acc = 0;
      for (const s of scenes) {
        if (s.id === id) {
          setPlayhead(acc + s.duration / 2);
          break;
        }
        acc += s.duration;
      }
    },
    [scenes],
  );

  const chooseTemplate = useCallback(
    (id?: string) => {
      const next = id && isTemplateAvailable(id) ? id : 'founder';
      setTemplate(next);
      pushActivity(`${templates.find((t) => t.id === next)?.name || 'Founder'} template selected.`);
      return next;
    },
    [pushActivity],
  );

  const getTimeline = useCallback(() => {
    return buildTimelineSnapshot({
      scenes: scenesRef.current,
      selectedSceneId: selectedRef.current,
      playhead: playheadRef.current,
      tracks: tracksRef.current,
    });
  }, []);

  const getState = useCallback((): StudioStateSnapshot => {
    const byok = hasOpenAIKey() || Boolean(openaiKey.trim());
    return {
      project,
      template,
      scenes,
      selectedSceneId: selected,
      website,
      activity,
      brief,
      pendingProposal: pendingRef.current,
      hasByok: byok,
      agentified: byok,
      falConnected: hasFalKey(),
      mode: 'local-demo',
      playhead,
      timeline: buildTimelineSnapshot({
        scenes,
        selectedSceneId: selected,
        playhead,
        tracks,
      }),
    };
  }, [project, template, scenes, selected, website, activity, brief, openaiKey, playhead, tracks]);

  const proposeTimelineEdits = useCallback(
    (input: { plan?: string; ops: unknown }) => {
      const ops = parseTimelineOps(input.ops) as TimelineOp[];
      if (!ops.length) throw new Error('ops array is empty');
      const applied = applyTimelineOps(
        {
          scenes: scenesRef.current,
          selectedSceneId: selectedRef.current,
          playhead: playheadRef.current,
          tracks: tracksRef.current,
        },
        ops,
      );
      setScenes(applied.state.scenes);
      setSelected(applied.state.selectedSceneId);
      setPlayhead(applied.state.playhead);
      setTracks(applied.state.tracks);
      const ok = applied.results.filter((r) => r.ok).length;
      const fail = applied.results.length - ok;
      pushActivity(
        `Timeline edits: ${ok} applied${fail ? `, ${fail} failed` : ''}${input.plan ? ` — ${input.plan.slice(0, 80)}` : ''}`,
      );
      return {
        status: 'timeline_updated' as const,
        plan: input.plan || null,
        results: applied.results,
        openEditor: applied.openEditor,
        timeline: buildTimelineSnapshot(applied.state),
      };
    },
    [pushActivity],
  );

  const setSceneImage = useCallback((sceneId: string, imageUrl: string) => {
    const scene = scenesRef.current.find((s) => s.id === sceneId);
    if (!scene) throw new Error('Scene not found');
    setScenes((all) => all.map((s) => (s.id === sceneId ? { ...s, image: imageUrl } : s)));
    setSelected(sceneId);
    void syncBlockImage(scene.title, imageUrl);
    return { status: 'image_applied' as const, sceneId, imageUrl };
  }, []);

  const setPendingProposalAction = useCallback((proposal: StoryboardProposal | null) => {
    pendingRef.current = proposal;
    setPendingProposal(proposal);
    if (proposal) setReviewOpen(true);
  }, []);

  const reviewProposal = useCallback((proposalId: string) => {
    const current = pendingRef.current;
    if (!current || current.proposalId !== proposalId) {
      throw new Error('Proposal not found');
    }
    setReviewOpen(true);
    return { status: 'review_opened' as const, proposalId };
  }, []);

  const applyProposal = useCallback(
    (proposalId: string) => {
      const proposal = pendingRef.current;
      if (!proposal || proposal.proposalId !== proposalId) {
        throw new Error('Proposal not found or already applied');
      }
      const nextScenes = mergeProposalScenes(scenesRef.current, proposal.scenes);
      setScenes(nextScenes);
      setTracks(buildInitialTracks(nextScenes));
      setPlayhead(0);
      if (proposal.projectTitle) setProject(proposal.projectTitle);
      if (proposal.templateId && isTemplateAvailable(proposal.templateId)) {
        setTemplate(proposal.templateId);
      }
      if (nextScenes[0]) setSelected(nextScenes[0].id);
      pendingRef.current = null;
      setPendingProposal(null);
      setReviewOpen(false);
      pushActivity(`Applied storyboard proposal ${proposalId}.`);
      return {
        status: 'applied' as const,
        proposalId,
        sceneCount: nextScenes.length,
        project: proposal.projectTitle || projectRef.current,
      };
    },
    [pushActivity],
  );

  const dismissProposal = useCallback(() => {
    pendingRef.current = null;
    setPendingProposal(null);
    setReviewOpen(false);
    pushActivity('Storyboard proposal dismissed.');
  }, [pushActivity]);

  const syncKey = useCallback((key: string) => {
    setOpenaiKey(key);
    setAgentified(Boolean(key.trim()));
  }, []);

  const newProject = useCallback(() => {
    const next = INITIAL_SCENES.map((s) => ({ ...s }));
    setScenes(next);
    setSelected('scene-1');
    setPlayhead(0);
    setTracks(buildInitialTracks(next));
    setTemplate('founder');
    setWebsite('');
    setProject('Untitled founder film');
    setBrief(null);
    pendingRef.current = null;
    setPendingProposal(null);
    setReviewOpen(false);
    setActivity(['New project started. Your creative space is ready.']);
    // Force a fresh Neon row on next autosave
    setStoredProjectId('');
    try {
      localStorage.removeItem('slush-project-id');
    } catch {
      /* ignore */
    }
    return {
      status: 'new_project' as const,
      project: 'Untitled founder film',
      template: 'founder',
      sceneCount: INITIAL_SCENES.length,
    };
  }, []);

  return {
    scenes,
    setScenes,
    selected,
    setSelected,
    playhead,
    setPlayhead,
    tracks,
    setTracks,
    template,
    website,
    setWebsite,
    project,
    setProject,
    activity,
    brief,
    setBrief,
    pendingProposal,
    reviewOpen,
    setReviewOpen,
    ready,
    openaiKey,
    agentified,
    syncKey,
    pushActivity,
    selectScene,
    setSceneImage,
    chooseTemplate,
    getState,
    getTimeline,
    proposeTimelineEdits,
    newProject,
    setPendingProposal: setPendingProposalAction,
    reviewProposal,
    applyProposal,
    dismissProposal,
  };
}
