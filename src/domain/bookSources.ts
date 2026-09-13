export interface BookEvidence {
  messageId: string;
  date: string;
  recordedAt?: string;
  url: string;
}
export interface BookMedia {
  path?: string;
  filename: string;
  caption: string;
  messageId: string;
  date: string;
  url: string;
  kind?: string;
  localUrl?: string;
  asset?: string;
  width?: number;
  height?: number;
}
export interface BookPractice {
  id: string;
  stepId: string;
  title: string;
  paragraphs: string[];
  actions: string[];
  check: string;
  sources: BookEvidence[];
  media: BookMedia[];
  status: 'production-record' | 'prototype' | 'proposal';
}
export interface BookSources {
  version: number;
  stages: Record<string, { intro: string; practice: BookPractice[] }>;
}
