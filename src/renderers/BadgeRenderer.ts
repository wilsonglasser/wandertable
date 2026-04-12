import type { CellData, CellRenderer, CellState } from '../types/index.js';

const DEFAULT_COLORS: Record<string, { bg: string; text: string }> = {
  active:   { bg: '#dcfce7', text: '#166534' },
  success:  { bg: '#dcfce7', text: '#166534' },
  inactive: { bg: '#fef2f2', text: '#991b1b' },
  error:    { bg: '#fef2f2', text: '#991b1b' },
  pending:  { bg: '#fef9c3', text: '#854d0e' },
  warning:  { bg: '#fef9c3', text: '#854d0e' },
  info:     { bg: '#dbeafe', text: '#1e40af' },
  default:  { bg: '#f1f5f9', text: '#475569' },
};

export class BadgeRenderer implements CellRenderer {
  render(cell: HTMLElement, data: CellData | undefined, _state: CellState): void {
    if (data?.value == null || data.value === '') {
      cell.textContent = '';
      return;
    }

    const label = String(data.value);
    const key = label.toLowerCase();
    const colors = DEFAULT_COLORS[key] ?? DEFAULT_COLORS.default;
    const customBg = data.meta?.badgeBg as string | undefined;
    const customText = data.meta?.badgeText as string | undefined;

    cell.innerHTML = `<span class="wt-badge" style="background:${customBg ?? colors.bg};color:${customText ?? colors.text}">${label}</span>`;
  }
}
