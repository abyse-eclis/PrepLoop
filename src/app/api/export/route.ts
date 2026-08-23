import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { todayInTimezone } from "@/lib/dates";
import { buildStudyExport, getDataBounds } from "@/features/export/data";
import {
  isExportRangeKind,
  resolveExportRange,
  type ExportRangeKind,
} from "@/lib/export/range";
import { isExportFormat, renderExport } from "@/lib/export/format";

export const dynamic = "force-dynamic";

/**
 * Download the study record as a file.
 *
 * GET /api/export?range=daily|weekly|monthly|custom|all&format=…&start=&end=
 *
 * The range is resolved server-side so the file always matches the label the
 * user picked, even if their clock disagrees with the workspace timezone.
 */
export async function GET(req: Request) {
  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const rangeParam = params.get("range") ?? "daily";
  const formatParam = params.get("format") ?? "csv-daily";

  if (!isExportRangeKind(rangeParam)) {
    return NextResponse.json({ error: "ช่วงเวลาไม่ถูกต้อง" }, { status: 400 });
  }
  if (!isExportFormat(formatParam)) {
    return NextResponse.json({ error: "รูปแบบไฟล์ไม่ถูกต้อง" }, { status: 400 });
  }

  const kind: ExportRangeKind = rangeParam;
  const bounds =
    kind === "all"
      ? await getDataBounds(workspace.id)
      : { earliest: null, latest: null };

  const resolved = resolveExportRange({
    kind,
    today: todayInTimezone(workspace.timezone),
    start: params.get("start"),
    end: params.get("end"),
    earliest: bounds.earliest,
    latest: bounds.latest,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const data = await buildStudyExport(workspace, resolved.range);
  const file = renderExport(data, formatParam);

  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
