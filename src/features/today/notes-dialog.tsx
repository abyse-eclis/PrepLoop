"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

const MAX = 500;

/** "เพิ่ม/แก้หมายเหตุ" dialog shared by every Study Session card. */
export function NotesDialog({
  open,
  onOpenChange,
  title,
  initialNotes,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialNotes: string | null;
  onSubmit: (notes: string) => void;
}) {
  const [value, setValue] = useState(initialNotes ?? "");

  useEffect(() => {
    if (open) setValue(initialNotes ?? "");
  }, [open, initialNotes]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialNotes ? "แก้หมายเหตุ" : "เพิ่มหมายเหตุ"}
      description={title}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            size="sm"
            disabled={value.length > MAX}
            onClick={() => {
              onSubmit(value.trim());
              onOpenChange(false);
            }}
          >
            บันทึกหมายเหตุ
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="เช่น ยังไม่เข้าใจช่วงท้ายคลิป, ทำสรุปไว้ในสมุดหน้า 12"
          rows={4}
          autoFocus
        />
        <p
          className={`text-right text-xs ${
            value.length > MAX ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {value.length}/{MAX}
        </p>
      </div>
    </Dialog>
  );
}
