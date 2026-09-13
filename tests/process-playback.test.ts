import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProcessVisual } from '../src/components/atlas/ProcessVisual';
import {
  amount,
  processPlaybackState,
  SINGLE_STEP_SPAN,
} from '../src/components/atlas/processGeometry';
import { PROCESS_STEPS } from '../src/components/atlas/processStages';
import { teachingModel } from '../src/components/book/teachingModel';

const model = teachingModel();
const render = (stage: string, step: number, playback: 'chapter' | 'step' = 'step') =>
  renderToStaticMarkup(createElement(ProcessVisual, { stage, step, playback, model }));
const layerOpacity = (html: string, layer: string) => {
  const match = html.match(new RegExp(`data-process-layer="${layer}"><g opacity="([^"]+)"`));
  return match ? Number(match[1]) : undefined;
};

describe('the textbook animates the selected action, including its geometry', () => {
  it('places only the balsa core, keeping the next carbon layer absent throughout playback', () => {
    for (const phase of [0, 0.25, 0.5, 1]) {
      const html = render('skin', 2 + phase * SINGLE_STEP_SPAN);
      expect(html).toContain('data-process-step="2"');
      expect(html).toContain('<title>バルサのコアを位置決めする</title>');
      expect(layerOpacity(html, 'outer')).toBe(1);
      expect(layerOpacity(html, 'core')).toBeCloseTo(phase);
      expect(layerOpacity(html, 'inner')).toBeUndefined();
    }
  });

  it('gives the final action a full local timeline without selecting another action', () => {
    for (const [stage, steps] of Object.entries(PROCESS_STEPS)) {
      const max = steps.length - 1;
      for (const phase of [0, 0.5, 1]) {
        const state = processPlaybackState(max + phase * SINGLE_STEP_SPAN, max, 'step');
        expect(state.index, stage).toBe(max);
        expect(state.sceneProgress, stage).toBe(max);
        expect(amount(state.assemblyProgress!, max), stage).toBeCloseTo(phase);
        expect(amount(state.assemblyProgress!, max + 1), stage).toBe(0);
      }
    }
    const html = render('skin', 7 + SINGLE_STEP_SPAN);
    expect(html).toContain('data-process-step="7"');
    expect(html).toContain('aria-valuetext="硬化・脱型する 100%"');
  });

  it('retains the original continuous geometry for legacy chapter playback', () => {
    const state = processPlaybackState(2.5, 7, 'chapter');
    expect(state).toEqual({
      index: 2,
      sceneProgress: 2.5,
      assemblyProgress: undefined,
      phase: undefined,
    });
    const html = render('skin', 2.5, 'chapter');
    expect(layerOpacity(html, 'core')).toBe(1);
    expect(layerOpacity(html, 'inner')).toBe(0.5);
  });
});
