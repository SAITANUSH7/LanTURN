import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { GripVertical, ArrowDown } from 'lucide-react';

/* ── Sortable Card Wrapper ───────────────────────────────────── */
function SortableCard({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

/* ── Droppable Column ────────────────────────────────────────── */
function DroppableColumn({ column, items, renderCard, totalItems }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`w-full flex flex-col rounded-3xl border transition-all duration-200 overflow-hidden ${
        isOver
          ? 'border-indigo-400 bg-indigo-50/50 shadow-soft-lg shadow-indigo-100'
          : 'border-white/60 bg-white/40 backdrop-blur-md shadow-soft-sm'
      }`}
    >
      {/* Column header */}
      <div className={`px-6 py-4 border-b flex items-center gap-3 flex-shrink-0 ${isOver ? 'border-indigo-200 bg-indigo-50' : 'border-white/50 bg-white/60 backdrop-blur-md'}`}>
        <div
          className="h-3.5 w-3.5 rounded-full flex-shrink-0 ring-4 ring-white"
          style={{ backgroundColor: column.color }}
        />
        <h3 className="text-base font-bold text-brand-900 flex-1">
          {column.title}
        </h3>
        <span className="text-sm font-semibold text-brand-700 bg-white shadow-sm rounded-full px-3 py-0.5 border border-brand-100">
          {items.length}
        </span>
      </div>

      {/* Card list */}
      <div className="flex-1 p-5 min-h-[140px] bg-transparent">
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <SortableCard key={item.id} id={item.id}>
              {renderCard(item)}
            </SortableCard>
          ))}
          </div>
        </SortableContext>

        {items.length === 0 && (
          <div className="flex items-center justify-center h-full min-h-[80px] text-xs text-brand-400 italic">
            Drop items here
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main KanbanBoard ────────────────────────────────────────── */
export default function KanbanBoard({
  columns,
  items,
  getItemColumn,
  onDragEnd,
  renderCard,
  renderDragOverlay,
}) {
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const itemsByColumn = {};
  columns.forEach((col) => {
    itemsByColumn[col.id] = items.filter((item) => getItemColumn(item) === col.id);
  });

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeItemObj = items.find((i) => i.id === active.id);
    if (!activeItemObj) return;

    // Determine the target column
    let targetColumnId = null;

    // Check if dropped on a column directly
    if (columns.some((c) => c.id === over.id)) {
      targetColumnId = over.id;
    } else {
      // Dropped on another card — find which column that card is in
      const overItem = items.find((i) => i.id === over.id);
      if (overItem) {
        targetColumnId = getItemColumn(overItem);
      }
    }

    if (!targetColumnId) return;

    const sourceColumnId = getItemColumn(activeItemObj);
    if (sourceColumnId === targetColumnId) return;

    onDragEnd({
      itemId: active.id,
      item: activeItemObj,
      fromColumn: sourceColumnId,
      toColumn: targetColumnId,
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col items-center w-full max-w-6xl mx-auto py-2">
        {columns.map((col, index) => (
          <div key={col.id} className="w-full flex flex-col items-center">
            {index > 0 && (
              <div className="flex flex-col items-center justify-center -my-1 z-10 text-brand-300">
                <div className="h-6 w-[2px] bg-brand-200"></div>
                <ArrowDown className="h-6 w-6 -mt-2 bg-white rounded-full text-brand-400" />
              </div>
            )}
            <div className="w-full relative z-0">
              <DroppableColumn
                column={col}
                items={itemsByColumn[col.id] || []}
                renderCard={renderCard}
                totalItems={items.length}
              />
            </div>
          </div>
        ))}
      </div>

      <DragOverlay>
        {activeItem && renderDragOverlay
          ? renderDragOverlay(activeItem)
          : activeItem
          ? renderCard(activeItem)
          : null}
      </DragOverlay>
    </DndContext>
  );
}
