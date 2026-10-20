'use client';

import { useState, useCallback, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';

export type LayoutCell = {
  id: string;
  label: string;
  imageSrc: string;
  colSpan?: 1 | 2;
  rowSpan?: 1 | 2;
};

export type LayoutPreset = '2x2' | 'left-big' | 'top-big';

interface OutfitEditorProps {
  cells: LayoutCell[];
  onCellsChange?: (cells: LayoutCell[]) => void;
  preset?: LayoutPreset;
  onPresetChange?: (preset: LayoutPreset) => void;
  showLabels?: boolean;
  readonly?: boolean;
}

const PRESETS: { id: LayoutPreset; name: string; grid: string }[] = [
  { id: '2x2', name: '2×2 四宫格', grid: 'grid-cols-2 grid-rows-2' },
  { id: 'left-big', name: '左大图', grid: 'grid-cols-2 grid-rows-2' },
  { id: 'top-big', name: '上大图', grid: 'grid-cols-2 grid-rows-2' },
];

export function applyPreset(cells: LayoutCell[], preset: LayoutPreset): LayoutCell[] {
  return cells.map((cell, idx) => {
    if (preset === '2x2') {
      return { ...cell, colSpan: 1, rowSpan: 1 };
    }
    if (preset === 'left-big') {
      // First cell (front) takes left column full height
      if (idx === 0) return { ...cell, colSpan: 1, rowSpan: 2 };
      return { ...cell, colSpan: 1, rowSpan: 1 };
    }
    if (preset === 'top-big') {
      // First cell takes top full width
      if (idx === 0) return { ...cell, colSpan: 2, rowSpan: 1 };
      return { ...cell, colSpan: 1, rowSpan: 1 };
    }
    return { ...cell, colSpan: 1, rowSpan: 1 };
  });
}

export function OutfitEditor({ cells, onCellsChange, preset = '2x2', onPresetChange, showLabels = true, readonly = false }: OutfitEditorProps) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const updateCells = useCallback((newCells: LayoutCell[]) => {
    onCellsChange?.(newCells);
  }, [onCellsChange]);

  const handlePresetChange = (newPreset: LayoutPreset) => {
    onPresetChange?.(newPreset);
    const newCells = applyPreset(cells, newPreset);
    updateCells(newCells);
  };

  // Drag and drop reorder
  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox
    e.dataTransfer.setData('text/plain', idx.toString());
  };

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) {
      handleDragEnd();
      return;
    }

    const newCells = [...cells];
    const [removed] = newCells.splice(draggedIdx, 1);
    newCells.splice(idx, 0, removed);
    // Re-apply current preset spans after reorder
    const reapplied = applyPreset(newCells, preset);
    updateCells(reapplied);
    handleDragEnd();
  };

  const gridClass = PRESETS.find((p) => p.id === preset)?.grid || 'grid-cols-2 grid-rows-2';

  return (
    <div>
      {/* Preset selector */}
      {!readonly && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-500">排版：</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePresetChange(p.id)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                preset === p.id
                  ? 'bg-pink-100 text-pink-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {p.name}
            </button>
          ))}
          <span className="text-xs text-gray-400 ml-2">拖拽图片调整顺序</span>
        </div>
      )}

      {/* Grid */}
      <div
        ref={containerRef}
        className={`grid gap-3 aspect-square bg-gray-50 rounded-xl p-3 ${gridClass}`}
        style={{ maxWidth: '600px', margin: '0 auto' }}
      >
        {cells.map((cell, idx) => {
          const colSpan = cell.colSpan === 2 ? 'col-span-2' : 'col-span-1';
          const rowSpan = cell.rowSpan === 2 ? 'row-span-2' : 'row-span-1';
          const isDragging = draggedIdx === idx;
          const isDropTarget = dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx;

          return (
            <div
              key={cell.id}
              draggable={!readonly}
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop(idx)}
              className={`relative group rounded-xl overflow-hidden border-2 transition-all ${colSpan} ${rowSpan} ${
                isDragging ? 'opacity-40 scale-95' : ''
              } ${isDropTarget ? 'border-pink-400 ring-2 ring-pink-200' : 'border-gray-200'} ${
                !readonly ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
            >
              <img
                src={cacheImageUrl(cell.imageSrc)}
                alt={cell.label}
                className="w-full h-full object-cover pointer-events-none"
                draggable={false}
              />

              {/* Drag handle indicator */}
              {!readonly && (
                <div className="absolute top-2 left-2 p-1 bg-black/40 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              )}

              {/* Label */}
              {showLabels && (
                <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full backdrop-blur-sm">
                  {cell.label}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
