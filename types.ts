export interface Position {
  x: number;
  y: number;
}

export interface PhotoData {
  id: string;
  dataUrl: string;
  caption: string;
  date: string;
  position: Position;
  zIndex: number;
  isDeveloping: boolean;
  isLoadingCaption: boolean;
}

export interface DragItem {
  type: 'WALL_PHOTO' | 'NEW_PHOTO';
  id?: string; // If wall photo
  offsetX: number;
  offsetY: number;
}

// Augment window for html2canvas
declare global {
  interface Window {
    html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
  }
}