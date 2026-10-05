#!/usr/bin/env python3
"""Extract the CanCLID zoengjyutgaai parquet dataset into static web assets.

Reads every parquet under --src, writes each record's OPUS audio to a per-episode
directory, and emits a per-episode JSON index plus a global manifest. Runs an
integrity check (157 contiguous episodes, record count == source rows) and exits
non-zero with details when it fails.

Output layout (under --out):
  audio/<NNN>/<NNN>_<MMM>.opus
  episodes/ep_<NNN>.json
  manifest.json
"""

import argparse
import glob
import json
import os
import sys
from collections import defaultdict

import pyarrow.parquet as pq
from pyjyutping.jyutping import convert as _jp_convert

EXPECTED_EPISODES = 157


def to_jyutping(text):
    """Per-code-point Jyutping (with tone numbers) aligned to `text`.

    Each element corresponds to one character of `text`. Non-Han characters
    (punctuation, digits, spaces) and characters with no dictionary reading
    yield "" so the array stays index-aligned with the transcription and the
    frontend can leave a blank placeholder under them.
    """
    result = []
    for ch in text:
        jp = _jp_convert(ch)
        # convert() echoes the character back when it has no Jyutping reading.
        result.append("" if jp == ch else jp.strip())
    return result


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--src", default="CanCLID/zoengjyutgaai",
                   help="directory containing the parquet files")
    p.add_argument("--out", default="dist-assets",
                   help="output directory for generated static assets")
    p.add_argument("--titles", default="data/episode-titles.json",
                   help="curated episode titles/arcs JSON used to fill manifest titles")
    p.add_argument("--limit-episodes", type=int, default=0,
                   help="if >0, only fully process these first N episodes (dev/testing)")
    p.add_argument("--skip-audio", action="store_true",
                   help="build indexes/manifest without writing audio bytes (fast dev run)")
    return p.parse_args()


def ep_dir(n):
    return f"{n:03d}"


def load_titles(path):
    """Load curated titles/arcs. Returns (ep_map, arcs).

    ep_map: {episode(int): {"title": str, "arc": int}}
    arcs:   [{id,name,subtitle,title,fromEpisode,toEpisode}] sorted by fromEpisode
    Raises FileNotFoundError / ValueError on a missing or malformed file so the
    build fails loudly instead of silently emitting null titles.
    """
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    ep_map = {}
    for e in data.get("episodes", []):
        title = e.get("title")
        if not title:
            raise ValueError(f"titles file {path}: episode {e.get('episode')} has empty title")
        ep_map[int(e["episode"])] = {"title": title, "arc": int(e["arc"])}

    arcs = [
        {k: a[k] for k in ("id", "name", "subtitle", "title", "fromEpisode", "toEpisode")}
        for a in data.get("arcs", [])
    ]
    arcs.sort(key=lambda a: a["fromEpisode"])
    return ep_map, arcs


def main():
    args = parse_args()
    files = sorted(glob.glob(os.path.join(args.src, "*.parquet")))
    if not files:
        print(f"ERROR: no parquet files under {args.src}", file=sys.stderr)
        return 2

    try:
        title_map, arcs = load_titles(args.titles)
    except (OSError, ValueError, KeyError) as exc:
        print(f"ERROR: cannot load titles file {args.titles}: {exc}", file=sys.stderr)
        return 2

    audio_root = os.path.join(args.out, "audio")
    episodes_root = os.path.join(args.out, "episodes")
    os.makedirs(audio_root, exist_ok=True)
    os.makedirs(episodes_root, exist_ok=True)

    # episode_id -> list of entries (kept in memory; text only, no audio bytes)
    episodes = defaultdict(list)
    source_rows = 0
    written_audio = 0
    total_duration = 0.0
    bad_audio = []

    for fp in files:
        pf = pq.ParquetFile(fp)
        source_rows += pf.metadata.num_rows
        cols = ["id", "episode_id", "audio_duration", "transcription", "audio"]
        for batch in pf.iter_batches(batch_size=512, columns=cols):
            data = {n: batch.column(n).to_pylist() for n in cols}
            for i in range(len(data["id"])):
                rid = data["id"][i]
                ep = data["episode_id"][i]
                dur = data["audio_duration"][i]
                text = data["transcription"][i]
                audio = data["audio"][i] or {}
                apath = audio.get("path") or f"{ep_dir(ep)}_{rid}.opus"

                if args.limit_episodes and ep > args.limit_episodes:
                    continue

                if not args.skip_audio:
                    abytes = audio.get("bytes")
                    if not abytes:
                        bad_audio.append(rid)
                    else:
                        dest_dir = os.path.join(audio_root, ep_dir(ep))
                        os.makedirs(dest_dir, exist_ok=True)
                        with open(os.path.join(dest_dir, apath), "wb") as f:
                            f.write(abytes)
                        written_audio += 1

                rel = f"audio/{ep_dir(ep)}/{apath}"
                episodes[ep].append({
                    "id": rid,
                    "duration": round(dur, 3) if dur is not None else None,
                    "transcription": text,
                    "jyutping": to_jyutping(text),
                    "audio": rel,
                })
                if dur:
                    total_duration += dur

    processed_records = sum(len(v) for v in episodes.values())

    # Per-episode index files (entries sorted by id == sequence order)
    manifest_episodes = []
    missing_titles = []
    for ep in sorted(episodes.keys()):
        entries = sorted(episodes[ep], key=lambda e: e["id"])
        ep_total = round(sum((e["duration"] or 0) for e in entries), 3)
        with open(os.path.join(episodes_root, f"ep_{ep_dir(ep)}.json"), "w",
                  encoding="utf-8") as f:
            json.dump({
                "episode": ep,
                "count": len(entries),
                "totalDuration": ep_total,
                "entries": entries,
            }, f, ensure_ascii=False)
        tinfo = title_map.get(ep)
        if tinfo is None:
            missing_titles.append(ep)
        manifest_episodes.append({
            "episode": ep,
            "title": tinfo["title"] if tinfo else None,
            "arc": tinfo["arc"] if tinfo else None,
            "count": len(entries),
            "totalDuration": ep_total,
            "cover": f"covers/ep_{ep_dir(ep)}.jpg",
            "index": f"episodes/ep_{ep_dir(ep)}.json",
        })

    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({
            "dataset": "CanCLID / zoengjyutgaai (Sam Gwok Jin Ji)",
            "source": "https://huggingface.co/datasets/CanCLID/zoengjyutgaai",
            "license": "CC0 1.0 Universal",
            "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
            "episodeCount": len(manifest_episodes),
            "recordCount": processed_records,
            "totalDuration": round(total_duration, 3),
            "arcs": arcs,
            "episodes": manifest_episodes,
        }, f, ensure_ascii=False, indent=2)

    # ---- Integrity check ----
    errors = []
    ep_ids = sorted(episodes.keys())
    if not args.limit_episodes:
        if len(ep_ids) != EXPECTED_EPISODES:
            errors.append(f"episode count {len(ep_ids)} != {EXPECTED_EPISODES}")
        expected_range = list(range(1, EXPECTED_EPISODES + 1))
        missing = [e for e in expected_range if e not in episodes]
        if missing:
            errors.append(f"missing episodes: {missing[:20]}{'...' if len(missing) > 20 else ''}")
        if processed_records != source_rows:
            errors.append(f"record count {processed_records} != source rows {source_rows}")
    if bad_audio:
        errors.append(f"{len(bad_audio)} records had empty audio bytes, e.g. {bad_audio[:5]}")
    if missing_titles:
        errors.append(f"{len(missing_titles)} processed episodes missing a title entry in "
                      f"{args.titles}: {missing_titles[:20]}"
                      f"{'...' if len(missing_titles) > 20 else ''}")

    print("=== extraction summary ===")
    print(f"parquet files      : {len(files)}")
    print(f"source rows        : {source_rows}")
    print(f"episodes processed : {len(ep_ids)}")
    print(f"records processed  : {processed_records}")
    print(f"audio files written: {written_audio}{' (skipped)' if args.skip_audio else ''}")
    print(f"total duration (s) : {round(total_duration, 1)}")

    if errors:
        print("\nINTEGRITY CHECK FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    if args.limit_episodes:
        print(f"\nlimited run OK: {len(ep_ids)} episodes, {processed_records} records "
              f"(integrity check skipped).")
    else:
        print(f"\nintegrity check passed: {EXPECTED_EPISODES} episodes, "
              f"record count matches source ({processed_records}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
