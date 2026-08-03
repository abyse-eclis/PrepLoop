"use client";

import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/input";

export function HistoryDatePicker({ date }: { date: string }) {
  const router = useRouter();
  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">เลือกวันที่</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) router.push(`/history?date=${e.target.value}`);
          }}
          className="w-44"
        />
      </div>
    </div>
  );
}
