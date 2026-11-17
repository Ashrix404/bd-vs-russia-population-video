# Master Production Plan — Bangladesh vs. Russia: Population Comparison by Size (~2 Minutes)

## 1. Hardware & Execution Guardrail (Zero Local Load)
- **Local Machine**: 3.6 GB RAM (~700 MB free).
- **Iron Rule**: Zero `npm install`, zero `remotion render`, zero `ffmpeg`, zero `kokoro`/`whisper` locally.
- **Cloud Pipeline**: 100% of neural TTS synthesis (`Kokoro-82M v1.0`), `faster-whisper` word-timestamp forced alignment, procedural cinema soundscape synthesis, Remotion 4.0.544 1080p rendering, FFmpeg ACES/Rec.709 color grading + EBU R128 (`-14 LUFS`) mastering, QA `ffprobe` verification, and public GitHub Release publishing execute on **GitHub Actions (`ubuntu-latest`)**.

## 2. Creative & Technical Specifications
- **Format**: `1920x1080` (16:9 Full HD), `30 fps`, ~120–130 seconds (~3,600–3,900 frames, dynamically locked to synthesized master audio via `calculateMetadata`).
- **4 Rigged Characters & Kokoro-82M Studio Voices**:
  1. **Noah Vance** (`am_michael`, Amber `#F59E0B`) — Documentary Host
  2. **Dr. Rafiq Rahman** (`bm_fable`, Bengal Emerald `#10B981` / Crimson `#F42A41`) — Dhaka Demographer
  3. **Prof. Dmitri Volkov** (`am_fenrir`, Arctic Cyan `#38BDF8`) — Moscow Cartographer
  4. **Maya Lin** (`af_heart`, Coral Rose `#FB7185`) — Spatial Lab Data Visualizer
- **8 Documentary Chapters**:
  1. `Scene01ColdOpenShock` — Rotating 3D Orthographic Globe & The Population Twist (`17.1M km² / 144M` vs `148,460 km² / 175M`)
  2. `Scene02TrueSizeOverlay` — Equal-Area Map Morph & `115.2×` Bangladesh Tiling Inside Russia
  3. `Scene03YakutiaVsBangladesh` — Sakha Republic (`3.08M km², 1M people, -50°C`) vs Bangladesh (`175M`) & Dhaka (`24M`) vs All Siberia (`36M`)
  4. `Scene04OneSqKmSimulator` — Inside `1 km²`: `8.4` vs `1,330` Living Human Beacons (`158×` Density)
  5. `Scene05DeltaMiracle` — Ganges-Brahmaputra-Meghna Silt Engine (`1B tons/yr`, 3 Rice Harvests)
  6. `Scene06FrozenGiantUralDivide` — Ural Mountains, `65%` Permafrost & The European Russia Triangle (`75%` pop on `23%` land)
  7. `Scene07DensitySwapExperiment` — If Densities Swapped: `20.1 Billion` Russia (`2.5× Earth`) vs `1.25 Million` Bangladesh
  8. `Scene08FinaleSynthesis` — 4-Character Roundtable & 6-Metric Master Scoreboard

## 3. 15-Agent Disjoint File Ownership Roster
1. **Agent 01**: `data/script.json`, `docs/DEMOGRAPHIC_FACTS.md`
2. **Agent 02**: `scripts/generate_audio_and_transcript.py`
3. **Agent 03**: `scripts/generate_soundscape_and_sfx.py`
4. **Agent 04**: `src/theme/tokens.ts`, `src/theme/fonts.ts`, `src/components/CinemaGradeOverlay.tsx`
5. **Agent 05**: `src/components/CharacterRig.tsx`, `src/components/CharacterStage.tsx`
6. **Agent 06**: `src/components/SyncedTranscriptBar.tsx`, `src/components/ChapterHUD.tsx`
7. **Agent 07**: `src/components/GeoMapEngine.tsx`, `src/scenes/Scene01ColdOpenShock.tsx`, `src/scenes/Scene02TrueSizeOverlay.tsx`
8. **Agent 08**: `src/scenes/Scene03YakutiaVsBangladesh.tsx`
9. **Agent 09**: `src/scenes/Scene04OneSqKmSimulator.tsx`
10. **Agent 10**: `src/scenes/Scene05DeltaMiracle.tsx`
11. **Agent 11**: `src/scenes/Scene06FrozenGiantUralDivide.tsx`
12. **Agent 12**: `src/scenes/Scene07DensitySwapExperiment.tsx`
13. **Agent 13**: `src/scenes/Scene08FinaleSynthesis.tsx`
14. **Agent 14**: `src/MainVideo.tsx`, `src/Root.tsx`, `src/index.ts`, `scripts/master_color_grade_ffmpeg.sh`
15. **Agent 15**: `.github/workflows/render-video.yml`, `scripts/validate_project_static.py`, `README.md`
