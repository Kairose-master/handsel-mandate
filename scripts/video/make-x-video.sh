#!/usr/bin/env bash
# Turn demo-video/demo.mp4 (from `npm run record:testnet -- demo-video --captions --outro ...`)
# into an X-ready 1920x1080 MP4 with Korean narration.
#   pip install edge-tts imageio-ffmpeg && bash scripts/video/make-x-video.sh demo-video
set -euo pipefail
DIR="${1:-demo-video}"; HERE="$(cd "$(dirname "$0")" && pwd)"
FF="${FFMPEG_PATH:-$(python3 -c 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())')}"
mkdir -p "$DIR/tts"
python3 - "$HERE/narration.ko.json" "$DIR/tts" <<'PY'
import json, sys, asyncio, os, edge_tts
lines = json.load(open(sys.argv[1])); out = sys.argv[2]
async def go():
    for l in lines:
        await edge_tts.Communicate(l['text'], voice='ko-KR-SunHiNeural', rate='+8%', proxy=os.environ.get('HTTPS_PROXY')).save(f"{out}/seg{l['id']}.mp3")
asyncio.run(go())
PY
# Offsets (ms) follow the storyboard captions; the last card is held 2.5 s longer for the closing line.
INPUTS=(); FILTERS=""; MIX=""
i=1; for at in 1000 6300 11000 18700 23600 29300; do INPUTS+=(-i "$DIR/tts/seg$i.mp3"); FILTERS+="[$i:a]adelay=$at|$at[a$i];"; MIX+="[a$i]"; i=$((i+1)); done
"$FF" -hide_banner -loglevel error -y -i "$DIR/demo.mp4" "${INPUTS[@]}" \
  -filter_complex "[0:v]scale=1728:1080:flags=lanczos,pad=1920:1080:96:0:color=#f5f7fc,tpad=stop_mode=clone:stop_duration=2.5,format=yuv420p[v];${FILTERS}${MIX}amix=inputs=6:normalize=0:dropout_transition=0,volume=1.25,aresample=48000[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 20 -r 30 -c:a aac -b:a 160k -movflags +faststart "$DIR/demo-x.mp4"
echo "wrote $DIR/demo-x.mp4"
