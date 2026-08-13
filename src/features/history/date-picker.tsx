"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";

export function HistoryDatePicker({ date }: { date: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">เลือกวันที่</Label>
      <div className="w-48">
        <DatePicker
          value={date}
          onChange={(v) => {
            if (v) router.push(`/history?date=${v}`);
          }}
          buddhist
          aria-label="เลือกวันที่ย้อนหลัง"
        />
      </div>
    </div>
  );
}
