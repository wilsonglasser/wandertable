export class LoadingOverlay {
  private el: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'wt-loading-overlay';
    this.el.innerHTML = '<div class="wt-loading-spinner"></div>';
    this.el.style.display = 'none';
    container.appendChild(this.el);
  }

  show(): void {
    this.el.style.display = '';
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  get isVisible(): boolean {
    return this.el.style.display !== 'none';
  }

  destroy(): void {
    this.el.remove();
  }
}
