import type { AtlasModel } from '../../domain/wikiAtlas';
export function initBlade(
  root: HTMLElement,
  data: AtlasModel,
  initialLocal?: boolean,
): (() => void) | undefined;
