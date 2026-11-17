#!/usr/bin/env python3
"""
Static Project & Timeline QA Validator (`< 15 MB` RAM, 100% Python 3 stdlib).

Validates before pushing to GitHub Actions:
1. JSON syntax & schema checks for:
   - `package.json`
   - `tsconfig.json`
   - `data/script.json`
   - `src/generated/timeline-manifest.json`
2. Documentary script invariants in `data/script.json`:
   - Exactly 8 scenes (`sceneIndex` 1..8)
   - Valid `characterId`s (`noah`, `rafiq`, `dmitri`, `maya`)
   - Valid `emotion` and `gesture` enums matching `src/types/video.ts`
   - Total dialogue word count within `250..400` words (~2 minutes)
3. TypeScript/TSX static module graph verification across `src/`:
   - Every local relative `import` / `export ... from` (`./...` or `../...`)
     resolves to an existing `.ts`, `.tsx`, `.d.ts`, or `.json` file
   - Every imported named symbol (and default import) exists as an export in
     the resolved target module
4. Determinism guardrail across `src/`:
   - ZERO `Math.random(` or `Date.now(` calls anywhere in `src/`
5. Script syntax verification:
   - `py_compile` passes on `scripts/generate_audio_and_transcript.py`,
     `scripts/generate_soundscape_and_sfx.py`, and this validator
   - `bash -n` passes on `scripts/master_color_grade_ffmpeg.sh`
"""

from __future__ import annotations

import json
import py_compile
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent

VALID_CHARACTER_IDS = frozenset({"noah", "rafiq", "dmitri", "maya"})
VALID_EMOTIONS = frozenset(
    {"neutral", "curious", "shocked", "analytical", "proud", "warm", "amused"}
)
VALID_GESTURES = frozenset(
    {"point_up", "open_palms", "chin_think", "count_fingers", "none"}
)

MIN_SCRIPT_WORDS = 250
MAX_SCRIPT_WORDS = 400
EXPECTED_SCENE_COUNT = 8


@dataclass(frozen=True)
class ImportRef:
    importer: Path
    line: int
    specifier: str
    default_import: str | None
    named_imports: tuple[str, ...]
    is_namespace: bool


def strip_ts_comments_preserve_lines(source: str) -> str:
    """
    Strips `// ...` line comments and `/* ... */` block comments from TS/TSX
    source while preserving exact newline positions (1-to-1 line numbers) and
    leaving quoted string literals intact.

    Single- and double-quoted states reset on raw newlines so apostrophes in JSX
    copy (e.g. `Earth's`) never swallow subsequent lines.
    """
    out: list[str] = []
    n = len(source)
    i = 0
    state = "code"  # code | line_comment | block_comment | single | double | template

    while i < n:
        ch = source[i]
        nxt = source[i + 1] if i + 1 < n else ""

        if state == "code":
            if ch == "/" and nxt == "/":
                out.append("  ")
                i += 2
                state = "line_comment"
                continue
            if ch == "/" and nxt == "*":
                out.append("  ")
                i += 2
                state = "block_comment"
                continue
            if ch == "'":
                out.append(ch)
                i += 1
                state = "single"
                continue
            if ch == '"':
                out.append(ch)
                i += 1
                state = "double"
                continue
            if ch == "`":
                out.append(ch)
                i += 1
                state = "template"
                continue
            out.append(ch)
            i += 1

        elif state == "line_comment":
            if ch == "\n":
                out.append("\n")
                state = "code"
            else:
                out.append(" ")
            i += 1

        elif state == "block_comment":
            if ch == "*" and nxt == "/":
                out.append("  ")
                i += 2
                state = "code"
                continue
            out.append("\n" if ch == "\n" else " ")
            i += 1

        elif state == "single":
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(source[i + 1])
                i += 2
                continue
            if ch == "'" or ch == "\n":
                state = "code"
            i += 1

        elif state == "double":
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(source[i + 1])
                i += 2
                continue
            if ch == '"' or ch == "\n":
                state = "code"
            i += 1

        elif state == "template":
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(source[i + 1])
                i += 2
                continue
            if ch == "`":
                state = "code"
            i += 1

    return "".join(out)


def line_number_at_offset(text: str, offset: int) -> int:
    return text.count("\n", 0, max(0, offset)) + 1


def load_json_checked(rel_path: str, errors: list[str]) -> Any | None:
    path = PROJECT_ROOT / rel_path
    if not path.is_file():
        errors.append(f"[JSON] Missing required file: {rel_path}")
        return None
    try:
        raw = path.read_text(encoding="utf-8")
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"[JSON] Failed to parse {rel_path}: {exc}")
        return None


def validate_script_json(script_doc: Any, errors: list[str]) -> int:
    if not isinstance(script_doc, dict):
        errors.append("[Script] data/script.json root must be a JSON object")
        return 0

    scenes = script_doc.get("scenes")
    if not isinstance(scenes, list):
        errors.append("[Script] data/script.json 'scenes' must be a list")
        return 0

    if len(scenes) != EXPECTED_SCENE_COUNT:
        errors.append(
            f"[Script] Expected {EXPECTED_SCENE_COUNT} scenes in data/script.json, found {len(scenes)}"
        )

    seen_scene_indices: list[int] = []
    seen_turn_ids: set[str] = set()
    total_words = 0

    for idx, scene in enumerate(scenes, start=1):
        if not isinstance(scene, dict):
            errors.append(f"[Script] Scene entry #{idx} must be an object")
            continue

        scene_index = scene.get("sceneIndex")
        if scene_index != idx:
            errors.append(
                f"[Script] Scene entry #{idx} has sceneIndex={scene_index!r} (expected {idx})"
            )
        if isinstance(scene_index, int):
            seen_scene_indices.append(scene_index)

        for str_key in ("sceneId", "title", "subtitle"):
            val = scene.get(str_key)
            if not isinstance(val, str) or not val.strip():
                errors.append(
                    f"[Script] Scene {scene_index}: '{str_key}' must be a non-empty string"
                )

        turns = scene.get("turns")
        if not isinstance(turns, list) or not turns:
            errors.append(
                f"[Script] Scene {scene_index}: 'turns' must be a non-empty list"
            )
            continue

        for t_pos, turn in enumerate(turns, start=1):
            if not isinstance(turn, dict):
                errors.append(
                    f"[Script] Scene {scene_index} turn #{t_pos} must be an object"
                )
                continue

            turn_id = turn.get("id")
            if not isinstance(turn_id, str) or not turn_id.strip():
                errors.append(
                    f"[Script] Scene {scene_index} turn #{t_pos} missing non-empty 'id'"
                )
                turn_id = f"scene_{scene_index}_turn_{t_pos}"
            elif turn_id in seen_turn_ids:
                errors.append(f"[Script] Duplicate turn id {turn_id!r}")
            else:
                seen_turn_ids.add(turn_id)

            if turn.get("sceneIndex") != scene_index:
                errors.append(
                    f"[Script] Turn {turn_id}: sceneIndex={turn.get('sceneIndex')!r} "
                    f"does not match parent sceneIndex={scene_index!r}"
                )

            char_id = turn.get("characterId")
            if char_id not in VALID_CHARACTER_IDS:
                errors.append(
                    f"[Script] Turn {turn_id}: invalid characterId={char_id!r} "
                    f"(allowed: {sorted(VALID_CHARACTER_IDS)})"
                )

            emotion = turn.get("emotion")
            if emotion not in VALID_EMOTIONS:
                errors.append(
                    f"[Script] Turn {turn_id}: invalid emotion={emotion!r} "
                    f"(allowed: {sorted(VALID_EMOTIONS)})"
                )

            gesture = turn.get("gesture")
            if gesture not in VALID_GESTURES:
                errors.append(
                    f"[Script] Turn {turn_id}: invalid gesture={gesture!r} "
                    f"(allowed: {sorted(VALID_GESTURES)})"
                )

            text = turn.get("text")
            if not isinstance(text, str) or not text.strip():
                errors.append(f"[Script] Turn {turn_id}: 'text' must be non-empty")
            else:
                total_words += len(text.split())

    if not (MIN_SCRIPT_WORDS <= total_words <= MAX_SCRIPT_WORDS):
        errors.append(
            f"[Script] Total dialogue words = {total_words} "
            f"(expected {MIN_SCRIPT_WORDS}..{MAX_SCRIPT_WORDS} words for ~2 minutes)"
        )

    return total_words


def validate_manifest_json(manifest_doc: Any, errors: list[str]) -> None:
    if not isinstance(manifest_doc, dict):
        errors.append(
            "[Manifest] src/generated/timeline-manifest.json root must be an object"
        )
        return

    if manifest_doc.get("fps") != 30:
        errors.append(
            f"[Manifest] Expected fps=30, got {manifest_doc.get('fps')!r}"
        )
    if manifest_doc.get("width") != 1920 or manifest_doc.get("height") != 1080:
        errors.append(
            f"[Manifest] Expected 1920x1080 canvas, got "
            f"{manifest_doc.get('width')!r}x{manifest_doc.get('height')!r}"
        )

    total_frames = manifest_doc.get("totalFrames")
    if not isinstance(total_frames, int) or total_frames <= 0:
        errors.append(
            f"[Manifest] totalFrames must be a positive integer, got {total_frames!r}"
        )

    scenes = manifest_doc.get("scenes")
    if not isinstance(scenes, list) or len(scenes) != EXPECTED_SCENE_COUNT:
        errors.append(
            f"[Manifest] Expected {EXPECTED_SCENE_COUNT} scenes in timeline-manifest.json"
        )
    else:
        cursor = 0
        for idx, s in enumerate(scenes, start=1):
            if not isinstance(s, dict):
                errors.append(f"[Manifest] Scene #{idx} must be an object")
                continue
            sf = s.get("startFrame")
            dur = s.get("durationInFrames")
            if sf != cursor:
                errors.append(
                    f"[Manifest] Scene #{idx} startFrame={sf!r} breaks contiguity at frame {cursor}"
                )
            if not isinstance(dur, int) or dur <= 0:
                errors.append(
                    f"[Manifest] Scene #{idx} durationInFrames={dur!r} must be positive"
                )
            else:
                cursor += dur
            for cid in s.get("activeCharacters", []):
                if cid not in VALID_CHARACTER_IDS:
                    errors.append(
                        f"[Manifest] Scene #{idx} contains invalid activeCharacter {cid!r}"
                    )
        if isinstance(total_frames, int) and cursor != total_frames:
            errors.append(
                f"[Manifest] Sum of scene durationInFrames ({cursor}) != totalFrames ({total_frames})"
            )

    visemes = manifest_doc.get("visemes")
    if not isinstance(visemes, dict):
        errors.append("[Manifest] 'visemes' must be an object")
    else:
        for cid in VALID_CHARACTER_IDS:
            if cid not in visemes or not isinstance(visemes[cid], list):
                errors.append(f"[Manifest] Missing visemes[{cid!r}] array")


def resolve_local_import_target(importer: Path, specifier: str) -> Path | None:
    base = (importer.parent / specifier).resolve()

    if base.suffix in {".ts", ".tsx", ".json"} and base.is_file():
        return base

    for ext in (".ts", ".tsx", ".d.ts", ".json"):
        cand = Path(str(base) + ext)
        if cand.is_file():
            return cand

    if base.is_dir():
        for index_name in ("index.ts", "index.tsx", "index.d.ts", "index.json"):
            cand = base / index_name
            if cand.is_file():
                return cand

    return None


def parse_import_clause(clause: str) -> tuple[str | None, tuple[str, ...], bool]:
    """
    Parses a TS/ES import clause (between `import` and `from`) into:
      `(default_import_name, named_exported_symbols, is_namespace_import)`
    """
    cleaned = clause.strip()
    if re.match(r"^type\b\s+", cleaned):
        cleaned = re.sub(r"^type\b\s+", "", cleaned, count=1).strip()

    named_symbols: list[str] = []
    brace_match = re.search(r"\{([^}]*)\}", cleaned)
    if brace_match:
        inside = brace_match.group(1)
        for raw_part in inside.split(","):
            part = raw_part.strip()
            if not part:
                continue
            part = re.sub(r"^type\b\s+", "", part).strip()
            if not part:
                continue
            if re.search(r"\s+as\s+", part):
                orig_name, _alias = re.split(r"\s+as\s+", part, maxsplit=1)
                named_symbols.append(orig_name.strip())
            else:
                named_symbols.append(part)
        cleaned = (cleaned[: brace_match.start()] + cleaned[brace_match.end() :]).strip()

    cleaned = cleaned.strip(",").strip()
    default_import: str | None = None
    is_namespace = False

    if cleaned:
        for seg in (s.strip() for s in cleaned.split(",") if s.strip()):
            if seg.startswith("*"):
                is_namespace = True
            else:
                default_import = seg

    return default_import, tuple(named_symbols), is_namespace


IMPORT_FROM_RE = re.compile(
    r"(?:^|[;\n])\s*import\s+(?!['\"])([A-Za-z0-9_$*,\s{}]+?)\s+from\s+['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
IMPORT_SIDE_EFFECT_RE = re.compile(
    r"(?:^|[;\n])\s*import\s+['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
EXPORT_LIST_RE = re.compile(
    r"\bexport\s+(?:type\s+)?\{([^}]*)\}(?:\s+from\s+['\"]([^'\"]+)['\"])?",
    re.MULTILINE,
)
EXPORT_STAR_NS_RE = re.compile(
    r"\bexport\s+(?:type\s+)?\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
EXPORT_STAR_RE = re.compile(
    r"\bexport\s+(?:type\s+)?\*\s+from\s+['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
EXPORT_DECL_PATTERNS = (
    re.compile(r"\bexport\s+(?:declare\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)"),
    re.compile(r"\bexport\s+(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)"),
    re.compile(r"\bexport\s+(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][A-Za-z0-9_$]*)"),
    re.compile(r"\bexport\s+(?:declare\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)"),
    re.compile(r"\bexport\s+(?:declare\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)"),
    re.compile(r"\bexport\s+(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)"),
)
EXPORT_DEFAULT_RE = re.compile(r"\bexport\s+default\b")


def collect_module_exports(
    target_path: Path,
    stripped_cache: dict[Path, str],
    export_cache: dict[Path, set[str]],
    visiting: set[Path] | None = None,
) -> set[str]:
    resolved = target_path.resolve()
    if resolved in export_cache:
        return export_cache[resolved]

    if visiting is None:
        visiting = set()
    if resolved in visiting:
        return set()
    visiting.add(resolved)

    exports: set[str] = set()

    if resolved.suffix == ".json":
        exports.add("default")
        try:
            parsed = json.loads(resolved.read_text(encoding="utf-8"))
            if isinstance(parsed, dict):
                exports.update(str(k) for k in parsed.keys())
        except Exception:  # noqa: BLE001
            pass
        export_cache[resolved] = exports
        visiting.discard(resolved)
        return exports

    stripped = stripped_cache.get(resolved)
    if stripped is None:
        raw = resolved.read_text(encoding="utf-8")
        stripped = strip_ts_comments_preserve_lines(raw)
        stripped_cache[resolved] = stripped

    for pat in EXPORT_DECL_PATTERNS:
        for m in pat.finditer(stripped):
            exports.add(m.group(1))

    if EXPORT_DEFAULT_RE.search(stripped):
        exports.add("default")

    for m in EXPORT_LIST_RE.finditer(stripped):
        body = m.group(1)
        for raw_item in body.split(","):
            item = raw_item.strip()
            if not item:
                continue
            item = re.sub(r"^type\b\s+", "", item).strip()
            if not item:
                continue
            if re.search(r"\s+as\s+", item):
                _orig, alias = re.split(r"\s+as\s+", item, maxsplit=1)
                exports.add(alias.strip())
            else:
                exports.add(item)

    for m in EXPORT_STAR_NS_RE.finditer(stripped):
        exports.add(m.group(1))

    for m in EXPORT_STAR_RE.finditer(stripped):
        spec = m.group(1)
        if spec.startswith("."):
            re_target = resolve_local_import_target(resolved, spec)
            if re_target is not None:
                sub_exports = collect_module_exports(
                    re_target, stripped_cache, export_cache, visiting
                )
                exports.update(sym for sym in sub_exports if sym != "default")

    visiting.discard(resolved)
    export_cache[resolved] = exports
    return exports


def extract_local_imports(ts_path: Path, stripped_source: str) -> list[ImportRef]:
    refs: list[ImportRef] = []

    for m in IMPORT_FROM_RE.finditer(stripped_source):
        clause = m.group(1)
        specifier = m.group(2).strip()
        if not (specifier.startswith("./") or specifier.startswith("../")):
            continue
        line_no = line_number_at_offset(stripped_source, m.start(1))
        default_imp, named_imps, is_ns = parse_import_clause(clause)
        refs.append(
            ImportRef(
                importer=ts_path,
                line=line_no,
                specifier=specifier,
                default_import=default_imp,
                named_imports=named_imps,
                is_namespace=is_ns,
            )
        )

    for m in IMPORT_SIDE_EFFECT_RE.finditer(stripped_source):
        specifier = m.group(1).strip()
        if not (specifier.startswith("./") or specifier.startswith("../")):
            continue
        line_no = line_number_at_offset(stripped_source, m.start(1))
        refs.append(
            ImportRef(
                importer=ts_path,
                line=line_no,
                specifier=specifier,
                default_import=None,
                named_imports=(),
                is_namespace=False,
            )
        )

    for m in EXPORT_LIST_RE.finditer(stripped_source):
        specifier = (m.group(2) or "").strip()
        if not (specifier.startswith("./") or specifier.startswith("../")):
            continue
        line_no = line_number_at_offset(stripped_source, m.start())
        needed: list[str] = []
        for raw_item in m.group(1).split(","):
            item = re.sub(r"^type\b\s+", "", raw_item.strip()).strip()
            if not item:
                continue
            if re.search(r"\s+as\s+", item):
                orig, _alias = re.split(r"\s+as\s+", item, maxsplit=1)
                needed.append(orig.strip())
            else:
                needed.append(item)
        refs.append(
            ImportRef(
                importer=ts_path,
                line=line_no,
                specifier=specifier,
                default_import=None,
                named_imports=tuple(needed),
                is_namespace=False,
            )
        )

    for pat in (EXPORT_STAR_NS_RE, EXPORT_STAR_RE):
        for m in pat.finditer(stripped_source):
            specifier = m.group(m.lastindex or 1).strip()
            if not (specifier.startswith("./") or specifier.startswith("../")):
                continue
            line_no = line_number_at_offset(stripped_source, m.start())
            refs.append(
                ImportRef(
                    importer=ts_path,
                    line=line_no,
                    specifier=specifier,
                    default_import=None,
                    named_imports=(),
                    is_namespace=True,
                )
            )

    return refs


FORBIDDEN_CALL_PATTERNS = (
    ("Math.random(", re.compile(r"\bMath\s*\.\s*random\s*\(")),
    ("Date.now(", re.compile(r"\bDate\s*\.\s*now\s*\(")),
)


def extract_external_packages(stripped_source: str) -> set[str]:
    pkgs: set[str] = set()
    for pat in (IMPORT_FROM_RE, IMPORT_SIDE_EFFECT_RE):
        for m in pat.finditer(stripped_source):
            spec = m.group(m.lastindex or 1).strip()
            if spec.startswith(".") or spec.startswith("/"):
                continue
            parts = spec.split("/")
            if spec.startswith("@") and len(parts) >= 2:
                pkgs.add(f"{parts[0]}/{parts[1]}")
            else:
                pkgs.add(parts[0])
    return pkgs


def validate_src_tree(
    declared_packages: set[str],
    errors: list[str],
) -> tuple[int, int, int]:
    src_dir = PROJECT_ROOT / "src"
    if not src_dir.is_dir():
        errors.append("[Src] Missing src/ directory")
        return 0, 0, 0

    ts_files = sorted(
        p for p in src_dir.rglob("*") if p.is_file() and p.suffix in {".ts", ".tsx"}
    )
    remotion_cfg = PROJECT_ROOT / "remotion.config.ts"
    if remotion_cfg.is_file():
        ts_files.append(remotion_cfg)

    if not ts_files:
        errors.append("[Src] No .ts or .tsx files found in src/")
        return 0, 0, 0

    stripped_cache: dict[Path, str] = {}
    export_cache: dict[Path, set[str]] = {}
    determinism_violations = 0

    for ts_file in ts_files:
        resolved = ts_file.resolve()
        raw = resolved.read_text(encoding="utf-8")
        stripped = strip_ts_comments_preserve_lines(raw)
        stripped_cache[resolved] = stripped
        rel = resolved.relative_to(PROJECT_ROOT)

        # Check forbidden non-deterministic calls across executable code
        for label, pat in FORBIDDEN_CALL_PATTERNS:
            for match in pat.finditer(stripped):
                determinism_violations += 1
                line_no = line_number_at_offset(stripped, match.start())
                errors.append(
                    f"[Determinism] Forbidden {label} call in {rel}:{line_no}"
                )

        # Verify external npm imports exist in package.json
        if declared_packages:
            for ext_pkg in sorted(extract_external_packages(stripped)):
                if ext_pkg not in declared_packages:
                    errors.append(
                        f"[Package] Undeclared external package {ext_pkg!r} imported in {rel}"
                    )

    checked_imports = 0
    for ts_file in ts_files:
        resolved = ts_file.resolve()
        rel_importer = resolved.relative_to(PROJECT_ROOT)
        refs = extract_local_imports(resolved, stripped_cache[resolved])

        for ref in refs:
            checked_imports += 1
            target = resolve_local_import_target(resolved, ref.specifier)
            if target is None:
                errors.append(
                    f"[Import] Unresolved relative import {ref.specifier!r} "
                    f"in {rel_importer}:{ref.line}"
                )
                continue

            target_exports = collect_module_exports(
                target, stripped_cache, export_cache
            )
            rel_target = target.relative_to(PROJECT_ROOT)

            if ref.default_import is not None and "default" not in target_exports:
                errors.append(
                    f"[Import] Default import {ref.default_import!r} in "
                    f"{rel_importer}:{ref.line} missing `export default` in {rel_target}"
                )

            for sym in ref.named_imports:
                if sym not in target_exports:
                    errors.append(
                        f"[Import] Named import {sym!r} in {rel_importer}:{ref.line} "
                        f"is not exported by {rel_target} "
                        f"(exports: {sorted(target_exports)})"
                    )

    return len(ts_files), checked_imports, determinism_violations


def validate_scripts_syntax(errors: list[str]) -> None:
    py_scripts = (
        "scripts/generate_audio_and_transcript.py",
        "scripts/generate_soundscape_and_sfx.py",
        "scripts/validate_project_static.py",
    )
    with tempfile.TemporaryDirectory() as tmp_dir:
        for idx, rel_py in enumerate(py_scripts):
            py_path = PROJECT_ROOT / rel_py
            if not py_path.is_file():
                errors.append(f"[Syntax] Missing Python script: {rel_py}")
                continue
            cfile = Path(tmp_dir) / f"compiled_{idx}.pyc"
            try:
                py_compile.compile(str(py_path), cfile=str(cfile), doraise=True)
            except py_compile.PyCompileError as exc:
                errors.append(f"[Syntax] py_compile failed for {rel_py}: {exc}")

    sh_rel = "scripts/master_color_grade_ffmpeg.sh"
    sh_path = PROJECT_ROOT / sh_rel
    if not sh_path.is_file():
        errors.append(f"[Syntax] Missing shell script: {sh_rel}")
    else:
        proc = subprocess.run(
            ["bash", "-n", str(sh_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            stderr = (proc.stderr or proc.stdout or "").strip()
            errors.append(f"[Syntax] bash -n failed for {sh_rel}: {stderr}")


def main() -> int:
    errors: list[str] = []

    pkg_doc = load_json_checked("package.json", errors)
    tsconfig_doc = load_json_checked("tsconfig.json", errors)
    script_doc = load_json_checked("data/script.json", errors)
    manifest_doc = load_json_checked("src/generated/timeline-manifest.json", errors)

    json_ok_count = sum(
        1 for doc in (pkg_doc, tsconfig_doc, script_doc, manifest_doc) if doc is not None
    )

    declared_packages: set[str] = set()
    if isinstance(pkg_doc, dict):
        deps = pkg_doc.get("dependencies", {})
        dev_deps = pkg_doc.get("devDependencies", {})
        if not isinstance(deps, dict) or "remotion" not in deps:
            errors.append("[Package] package.json missing 'remotion' dependency")
        for group in (deps, dev_deps):
            if isinstance(group, dict):
                for pkg_name in group.keys():
                    declared_packages.add(str(pkg_name))
                    if str(pkg_name).startswith("@types/"):
                        typed_target = str(pkg_name)[len("@types/") :]
                        if "__" in typed_target:
                            scope, rest = typed_target.split("__", 1)
                            declared_packages.add(f"@{scope}/{rest}")
                        else:
                            declared_packages.add(typed_target)

    if isinstance(tsconfig_doc, dict):
        compiler_opts = tsconfig_doc.get("compilerOptions", {})
        if not isinstance(compiler_opts, dict) or not compiler_opts.get("resolveJsonModule"):
            errors.append(
                "[TSConfig] tsconfig.json must enable compilerOptions.resolveJsonModule"
            )

    total_words = 0
    num_scenes_found = 0
    if script_doc is not None:
        if isinstance(script_doc, dict) and isinstance(script_doc.get("scenes"), list):
            num_scenes_found = len(script_doc["scenes"])
        total_words = validate_script_json(script_doc, errors)

    if manifest_doc is not None:
        validate_manifest_json(manifest_doc, errors)

    num_ts_files, num_imports, det_violations = validate_src_tree(
        declared_packages, errors
    )
    validate_scripts_syntax(errors)

    print("==================================================================")
    print(" Bangladesh vs. Russia — Static QA & Architecture Audit")
    print("==================================================================")
    print(f"  JSON configs verified : {json_ok_count}/4 (package, tsconfig, script, manifest)")
    print(f"  Script scenes / words : {num_scenes_found} scenes, {total_words} words")
    print(f"  TS/TSX files scanned  : {num_ts_files} files ({num_imports} relative imports)")
    print(f"  Determinism check     : {det_violations} forbidden Math.random/Date.now calls")
    print("  Script syntax checks  : Python py_compile + bash -n")
    print("==================================================================")

    if errors:
        print(f"FAILED with {len(errors)} error(s):", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("PASS: All static checks succeeded with zero errors.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
