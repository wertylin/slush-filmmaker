'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTemplateAvailable, photos, templates } from '@/components/shared';
import { getOpenAIKey, hasOpenAIKey } from '@/components/keys';

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

export type StudioTab = 'Overview' | 'Templates' | 'Projects' | 'Assets' | 'Docs';

export const STUDIO_TABS: StudioTab[] = ['Overview', 'Templates', 'Projects', 'Assets', 'Docs'];

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
  mode: 'local-demo';
  tab?: StudioTab;
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
  scenesRef.current = scenes;
  projectRef.current = project;

  const pushActivity = useCallback((text: string) => {
    setActivity((a) => [...a, text]);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const data = JSON.parse(saved) as {
          scenes?: Scene[];
          project?: string;
          website?: string;
          brief?: WebsiteBrief | null;
          pendingProposal?: StoryboardProposal | null;
        };
        if (Array.isArray(data.scenes) && data.scenes.length) {
          setScenes(data.scenes);
          setSelected(data.scenes[0].id);
          setProject(data.project || 'Untitled founder film');
          setWebsite(data.website || '');
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
    const key = getOpenAIKey();
    setOpenaiKey(key);
    setAgentified(Boolean(key));
    const id = new URLSearchParams(window.location.search).get('template');
    if (id && isTemplateAvailable(id)) setTemplate(id);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(
      STORAGE,
      JSON.stringify({ scenes, project, website, brief, pendingProposal }),
    );
  }, [scenes, project, website, brief, pendingProposal, ready]);

  const selectScene = useCallback(
    (id: string) => {
      if (!scenes.some((s) => s.id === id)) throw new Error('Scene not found');
      setSelected(id);
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
      mode: 'local-demo',
    };
  }, [project, template, scenes, selected, website, activity, brief, openaiKey]);

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
    setScenes(INITIAL_SCENES.map((s) => ({ ...s })));
    setSelected('scene-1');
    setTemplate('founder');
    setWebsite('');
    setProject('Untitled founder film');
    setBrief(null);
    pendingRef.current = null;
    setPendingProposal(null);
    setReviewOpen(false);
    setActivity(['New project started. Your creative space is ready.']);
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
    chooseTemplate,
    getState,
    newProject,
    setPendingProposal: setPendingProposalAction,
    reviewProposal,
    applyProposal,
    dismissProposal,
  };
}
