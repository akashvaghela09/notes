import type { DragEvent } from 'react';

// Lightweight drag-and-drop payload shared by the sidebar tree and the main
// window, so notes and folders can be dragged into folders to move/reparent.

export type DragKind = 'note' | 'folder';
export interface DragPayload {
  kind: DragKind;
  id: string;
}

const MIME = 'application/x-notes';

export function startDrag(e: DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
}

/** Read the dragged payload on drop. (Unavailable during dragover by spec.) */
export function readDrag(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(MIME);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}
