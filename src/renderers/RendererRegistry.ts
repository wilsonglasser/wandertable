import type { CellRenderer } from '../types/index.js';
import { TextRenderer } from './TextRenderer.js';
import { CheckboxRenderer } from './CheckboxRenderer.js';
import { BadgeRenderer } from './BadgeRenderer.js';
import { NumberRenderer } from './NumberRenderer.js';
import { ProgressRenderer } from './ProgressRenderer.js';
import { BlankRenderer } from './BlankRenderer.js';

export class RendererRegistry {
  private renderers = new Map<string, CellRenderer>();
  readonly defaultRenderer: CellRenderer;

  constructor() {
    this.defaultRenderer = new TextRenderer();
    this.renderers.set('text', this.defaultRenderer);
    this.renderers.set('blank', new BlankRenderer());
    this.renderers.set('checkbox', new CheckboxRenderer());
    this.renderers.set('badge', new BadgeRenderer());
    this.renderers.set('number', new NumberRenderer());
    this.renderers.set('progress', new ProgressRenderer());
  }

  register(name: string, renderer: CellRenderer): void {
    this.renderers.set(name, renderer);
  }

  get(name: string): CellRenderer | undefined {
    return this.renderers.get(name);
  }

  getAll(): Map<string, CellRenderer> {
    return this.renderers;
  }
}
