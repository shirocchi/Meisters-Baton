import { describe, expect, it } from 'vitest';
import { BOOK_GLOSSARY } from '../src/domain/bookGlossary';
import { CHAPTER_NARRATIVES, SECTION_NARRATIVES } from '../src/domain/bookNarrative';
import { LESSONS } from '../src/domain/textbook';

describe('the book keeps its explanations connected to every reading page', () => {
  it('provides a chapter introduction and a section narrative for every lesson group', () => {
    const chapters = Object.keys(LESSONS).sort();
    expect(Object.keys(CHAPTER_NARRATIVES).sort()).toEqual(chapters);
    expect(Object.keys(SECTION_NARRATIVES).sort()).toEqual(chapters);
    for (const chapter of chapters) {
      expect(SECTION_NARRATIVES[chapter], chapter).toHaveLength(LESSONS[chapter].groups.length);
    }
  });

  it('keeps each observation within the steps available on the same reading page', () => {
    for (const [chapter, narratives] of Object.entries(SECTION_NARRATIVES)) {
      narratives.forEach((narrative, index) => {
        const group = LESSONS[chapter].groups[index];
        const context = `${chapter}, section ${index + 1}`;
        expect(Number.isInteger(narrative.step), context).toBe(true);
        expect(narrative.step, context).toBeGreaterThanOrEqual(group.from);
        expect(narrative.step, context).toBeLessThanOrEqual(group.to);
      });
    }
  });

  it('gives dictionary entries unique identities and a valid chapter filter', () => {
    const ids = BOOK_GLOSSARY.map((term) => term.id);
    const names = BOOK_GLOSSARY.map((term) => term.term);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    const chapters = new Set(['overview', ...Object.keys(LESSONS)]);
    for (const term of BOOK_GLOSSARY) {
      expect(chapters.has(term.chapter), term.term).toBe(true);
    }
  });
});
