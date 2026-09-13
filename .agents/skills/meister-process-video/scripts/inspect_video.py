"""Extract evidence frames and optional decode audit; no semantic claims.

Requires PyAV and Pillow. Input media is read-only; use a new output directory.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--at", type=float, nargs="+")
    parser.add_argument("--interval", type=float, default=8.0)
    parser.add_argument("--max-frames", type=int, default=48)
    parser.add_argument("--full-decode", action="store_true")
    args = parser.parse_args()
    try:
        import av
        from PIL import Image, ImageDraw
    except ImportError as exc:
        parser.exit(2, f"Missing dependency: {exc.name}. Use Python with av and Pillow installed.\n")
    if not args.video.is_file():
        parser.error("Input video does not exist")
    if not math.isfinite(args.interval) or args.interval <= 0 or args.max_frames < 1:
        parser.error("interval and max-frames must be positive")
    if args.out.exists() and (not args.out.is_dir() or any(args.out.iterdir())):
        parser.error("Use a new or empty output directory; existing evidence is preserved")

    with av.open(str(args.video)) as container:
        if not container.streams.video:
            parser.error("Input has no video stream")
        stream = container.streams.video[0]
        duration = (float(stream.duration * stream.time_base) if stream.duration is not None
                    else container.duration / av.time_base if container.duration is not None else None)
        origin = float((stream.start_time or 0) * stream.time_base)
        report = {
            "input": str(args.video.resolve()),
            "width": stream.width, "height": stream.height,
            "video_streams": len(container.streams.video),
            "audio_streams": len(container.streams.audio),
            "codec": stream.codec_context.name,
            "average_fps": float(stream.average_rate) if stream.average_rate else None,
            "duration_seconds": duration, "stream_start_pts_seconds": origin,
            "declared_frames": stream.frames,
            "scope": "Metadata, evidence extraction and optional decoding only; no playback or semantic approval",
        }
        if args.full_decode:
            count = missing = non_increasing = 0
            first = previous = last = None
            minimum_gap = maximum_gap = None
            for frame in container.decode(stream):
                count += 1
                if frame.pts is None:
                    missing += 1
                    continue
                pts = float(frame.pts * frame.time_base)
                if first is None:
                    first = pts
                if previous is not None:
                    gap = pts - previous
                    non_increasing += int(gap <= 0)
                    minimum_gap = gap if minimum_gap is None else min(minimum_gap, gap)
                    maximum_gap = gap if maximum_gap is None else max(maximum_gap, gap)
                previous = last = pts
            report["decode"] = {
                "completed_to_eof": True, "decoded_frames": count,
                "missing_pts": missing, "non_increasing_pts": non_increasing,
                "first_pts_seconds": first, "last_pts_seconds": last,
                "min_frame_gap_seconds": minimum_gap, "max_frame_gap_seconds": maximum_gap,
                "note": "Variable frame intervals are recorded, not automatically rejected",
            }

    if args.at:
        times = sorted(set(args.at))
    else:
        if duration is None or duration <= 0:
            parser.error("Duration unavailable; supply explicit --at times")
        count = max(1, min(args.max_frames, math.ceil(duration / args.interval)))
        times = [duration * (i + .5) / count for i in range(count)]
    if len(times) > args.max_frames:
        parser.error("Explicit times exceed max-frames; raise the limit or use smaller batches")
    if any(not math.isfinite(t) or t < 0 or (duration is not None and t >= duration) for t in times):
        parser.error("Requested times must be finite, nonnegative and before the end")
    digest = hashlib.sha256()
    with args.video.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    report["sha256"] = digest.hexdigest()
    args.out.mkdir(parents=True, exist_ok=True)
    frames = []
    for index, requested in enumerate(times):
        with av.open(str(args.video)) as container:
            stream = container.streams.video[0]
            target = origin + requested
            container.seek(int(target / stream.time_base), stream=stream, backward=True)
            for frame in container.decode(stream):
                if frame.pts is None:
                    continue
                pts = float(frame.pts * frame.time_base)
                if pts + 1e-7 < target:
                    continue
                name = f"frame-{index + 1:04d}.jpg"
                frame.to_image().save(args.out / name, quality=94)
                frames.append({"requested_seconds": requested, "actual_pts_seconds": pts,
                               "actual_elapsed_seconds": pts - origin, "file": name})
                break
            else:
                frames.append({"requested_seconds": requested, "error": "No frame at or after requested time"})
    report["frames"] = frames
    report["extraction_complete"] = all("file" in record for record in frames)
    # Small paged contact sheets, retaining the unmodified full-frame JPEGs.
    selected = [record for record in frames if "file" in record]
    sheets = []
    for start in range(0, len(selected), 12):
        page = selected[start:start + 12]
        cell_w = 480
        cell_h = round(report["height"] * cell_w / report["width"]) + 24
        sheet = Image.new("RGB", (cell_w * 3, cell_h * math.ceil(len(page) / 3)), "#101824")
        draw = ImageDraw.Draw(sheet)
        for index, record in enumerate(page):
            with Image.open(args.out / record["file"]) as original:
                thumb = original.copy()
                thumb.thumbnail((cell_w, cell_h - 24))
            x = (index % 3) * cell_w
            y = (index // 3) * cell_h
            sheet.paste(thumb, (x, y + 24))
            draw.text((x + 5, y + 5), f"{record['file']} | PTS {record['actual_pts_seconds']:.3f}s", fill="white")
        name = f"contact-{start // 12 + 1:02d}.jpg"
        sheet.save(args.out / name, quality=92)
        sheets.append(name)
    report["contact_sheets"] = sheets
    (args.out / "inspection.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"report": str((args.out / 'inspection.json').resolve()),
                      "extracted_frames": len(selected), "extraction_complete": report["extraction_complete"],
                      "decoded_frames": report.get("decode", {}).get("decoded_frames")}, ensure_ascii=False))
    return 0 if report["extraction_complete"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
