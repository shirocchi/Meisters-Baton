export type ClaimKind = 'step' | 'judgment' | 'warning';
export type ReviewState = 'draft' | 'confirmed';
export type AnalysisMode = 'ai' | 'manual' | 'demo';
export interface Frame {
  id: string;
  time: number;
  dataUrl: string;
}
export interface Segment {
  id: string;
  start: number;
  end: number;
  title: string;
  observation: string;
}
export interface InterviewQuestion {
  id: string;
  segmentId: string;
  text: string;
  reason: string;
  kind: ClaimKind;
}
export interface ExpertAnswer {
  id: string;
  questionId: string;
  text: string;
  author: string;
  createdAt: string;
  source: 'text' | 'voice';
}
export interface Analysis {
  mode: AnalysisMode;
  summary: string;
  segments: Segment[];
  questions: InterviewQuestion[];
  limitations: string[];
}
export interface Recording {
  id: string;
  title: string;
  category: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  mediaId?: string;
  remoteMediaId?: string;
  fileName?: string;
  mimeType?: string;
  frames: Frame[];
  notes: string;
  analysis?: Analysis;
  answers: ExpertAnswer[];
  status: 'recorded' | 'interview' | 'draft' | 'published';
  isDemo: boolean;
}
export interface Evidence {
  id: string;
  kind: 'video' | 'answer' | 'note';
  recordingId: string;
  time?: number;
  answerId?: string;
  quote: string;
}
export interface Claim {
  id: string;
  kind: ClaimKind;
  title: string;
  body: string;
  evidence: Evidence[];
  review: ReviewState;
  reviewedBy?: string;
  reviewedAt?: string;
}
export interface ArticleRevision {
  id: string;
  number: number;
  createdAt: string;
  author: string;
  title: string;
  summary: string;
  claims: Claim[];
  reason: string;
}
export interface Article {
  id: string;
  recordingId: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  claims: Claim[];
  author: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'published';
  isDemo: boolean;
  revisions: ArticleRevision[];
  bookmarked: boolean;
}
export interface KnowledgeRequest {
  id: string;
  text: string;
  category: string;
  createdAt: string;
  status: 'open' | 'resolved';
  articleId?: string;
}
export interface Activity {
  id: string;
  type: 'record' | 'answer' | 'publish' | 'review' | 'request';
  title: string;
  createdAt: string;
  targetId?: string;
}
export interface TeamData {
  schemaVersion: 1;
  workspace: { id: string; name: string };
  recordings: Recording[];
  articles: Article[];
  requests: KnowledgeRequest[];
  activity: Activity[];
}
export interface Settings {
  displayName: string;
  apiBaseUrl: string;
  demoVisible: boolean;
  onboardingDone: boolean;
  aiConsent: boolean;
}
export interface SearchResult {
  articleId: string;
  claimId: string;
  title: string;
  body: string;
  category: string;
  evidence: Evidence[];
  score: number;
  isDemo: boolean;
}
export interface SearchAnswer {
  answer: string;
  citations: { articleId: string; claimId: string; quote: string }[];
  insufficient: boolean;
}
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  teamId: string;
  teamName: string;
  role: 'owner' | 'member';
}
export interface AuthSession {
  token: string;
  user: AuthUser;
}
export interface SyncEnvelope {
  version: number;
  data: TeamData;
}
