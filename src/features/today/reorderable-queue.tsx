"use client";

import { useState, useTransition, useEffect } from "react";
import {
  GripVertical,
  RotateCcw,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import type { QueuePlanItem } from "@/features/today/data";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ItemRow } from "./item-row";
import {
  saveDailyExecutionOrder,
  resetDailyExecutionOrder,
} from "./actions";

interface ReorderableQueueProps {
  title: string;
  description: string;
  items: QueuePlanItem[];
  date: string;
  hasCustomOrder: boolean;
}

export function ReorderableQueue({
  title,
  description,
  items: initialItems,
  date,
  hasCustomOrder: initialHasCustomOrder,
}: ReorderableQueueProps) {
  const [items, setItems] = useState<QueuePlanItem[]>(initialItems);
  const [hasCustomOrder, setHasCustomOrder] = useState(initialHasCustomOrder);
  const [isReordering, setIsReordering] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    setItems(initialItems);
    setHasCustomOrder(initialHasCustomOrder);
  }, [initialItems, initialHasCustomOrder]);

  if (items.length === 0) return null;

  function persistOrder(newItems: QueuePlanItem[]) {
    setItems(newItems);
    setHasCustomOrder(true);
    startTransition(async () => {
      const itemIds = newItems.map((row) => row.item.id);
      const res = await saveDailyExecutionOrder({
        date,
        orderedItemIds: itemIds,
      });
      if (res.ok) {
        toast({
          variant: "success",
          title: "บันทึกลำดับการเรียนแล้ว",
          description: "ลำดับนี้จะคงอยู่เมื่อรีเฟรชหน้า",
        });
      } else {
        toast({
          variant: "error",
          title: "ไม่สามารถบันทึกลำดับได้",
          description: res.error,
        });
      }
    });
  }

  function handleResetOrder() {
    startTransition(async () => {
      const res = await resetDailyExecutionOrder({ date });
      if (res.ok) {
        setHasCustomOrder(false);
        setIsReordering(false);
        toast({
          variant: "success",
          title: "คืนลำดับตามแผนเรียบร้อย",
          description: "กลับไปใช้ลำดับเริ่มต้นจาก Study Plan Engine",
        });
      } else {
        toast({
          variant: "error",
          title: "ไม่สามารถคืนลำดับได้",
          description: res.error,
        });
      }
    });
  }

  function moveItem(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;
    const updated = [...items];
    const [moved] = updated.splice(fromIndex, 1);
    if (!moved) return;
    updated.splice(toIndex, 0, moved);
    persistOrder(updated);
  }

  function handleDragStart(index: number) {
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(index: number) {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    moveItem(draggedIndex, index);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {title} ({items.length})
            </h2>
            {hasCustomOrder ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <Sparkles className="h-3 w-3" />
                จัดลำดับเอง
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={isReordering ? "secondary" : "outline"}
            onClick={() => setIsReordering((v) => !v)}
            title="สลับโหมดจัดลำดับการเรียนของวันนี้"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {isReordering ? "เสร็จสิ้นการจัดลำดับ" : "จัดลำดับวันนี้"}
          </Button>

          {hasCustomOrder ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={handleResetOrder}
              title="ล้างการจัดลำดับเองและใช้ลำดับเดิมจากแผน"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              คืนลำดับตามแผน
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((row, index) => {
          const isDragging = draggedIndex === index;
          const isOver = dragOverIndex === index && draggedIndex !== index;

          return (
            <div
              key={row.item.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={`group relative transition-all duration-150 ${
                isDragging
                  ? "opacity-40 scale-[0.99] border-dashed border-primary"
                  : ""
              } ${
                isOver
                  ? "border-t-2 border-primary pt-1 shadow-md ring-2 ring-primary/20 rounded-lg"
                  : ""
              }`}
            >
              <div className="flex items-start gap-2">
                {/* Drag Handle and Order Badge */}
                <div className="mt-4 flex flex-col items-center gap-1 select-none">
                  <div
                    className="flex h-7 w-7 cursor-grab active:cursor-grabbing items-center justify-center rounded-md bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="ลากเพื่อจัดลำดับ"
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <span className="rounded-full bg-secondary/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-secondary-foreground">
                    #{index + 1}
                  </span>

                  {isReordering ? (
                    <div className="flex flex-col gap-0.5 mt-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 p-0"
                        disabled={index === 0 || pending}
                        onClick={() => moveItem(index, index - 1)}
                        title="เลื่อนขึ้น"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 p-0"
                        disabled={index === items.length - 1 || pending}
                        onClick={() => moveItem(index, index + 1)}
                        title="เลื่อนลง"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : null}
                </div>

                {/* Main Item Row */}
                <div className="flex-1 min-w-0">
                  <ItemRow
                    row={row}
                    date={date}
                    orderIndex={index + 1}
                    prerequisiteStatus={row.prerequisiteStatus}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
