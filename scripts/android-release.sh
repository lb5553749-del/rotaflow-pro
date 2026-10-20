#!/usr/bin/env bash
# Gera APK release assinado e copia para dist/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# JDK: env > java_home (21) > JBR local. Sem hardcode de versão de patch.
if [[ -z "${JAVA_HOME:-}" && -x /usr/libexec/java_home ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
fi
if [[ -z "${JAVA_HOME:-}" && -d "$HOME/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home" ]]; then
  export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home"
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
else
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
fi

npm run cap:sync
node scripts/patch-screen-events-android.js
node scripts/ensure-release-signing.js

# version.json = fonte da verdade (versionName / versionCode)
python3 - <<'PY'
from pathlib import Path
import json, re
ver = json.loads(Path('version.json').read_text())
name = str(ver['versionName'])
code = int(ver['versionCode'])
p = Path('android/app/build.gradle')
text = p.read_text()
text2 = re.sub(r'versionCode\s+\d+', f'versionCode {code}', text)
text2 = re.sub(r'versionName\s+"[^"]+"', f'versionName "{name}"', text2)
if text2 != text:
    p.write_text(text2)
    print(f'version -> {name} ({code})')
else:
    print(f'version já {name} ({code})')
PY

# Notificações (Android 13+)
python3 - <<'PY'
from pathlib import Path
p = Path('android/app/src/main/AndroidManifest.xml')
text = p.read_text()
tag = '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
if tag not in text:
    if '</manifest>' in text:
        text = text.replace('</manifest>', f'    {tag}\n</manifest>')
        p.write_text(text)
        print('AndroidManifest: POST_NOTIFICATIONS adicionado')
    else:
        print('AndroidManifest: não foi possível adicionar POST_NOTIFICATIONS')
else:
    print('AndroidManifest: POST_NOTIFICATIONS já presente')
PY

# Aviso se google-services.json (Crashlytics) estiver ausente
if [[ ! -f android/app/google-services.json ]]; then
  echo ""
  echo "AVISO: android/app/google-services.json ausente."
  echo "  Crashlytics não reportará até você baixar o arquivo no Firebase Console"
  echo "  (Projeto rotaflow-83610 → App Android com.rotaflow.pro → google-services.json)"
  echo "  e colocar em android/app/google-services.json, depois rebuild."
  echo ""
fi

cd android
./gradlew assembleRelease

OUT="app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$OUT" ]]; then
  echo "APK release não encontrado em $OUT" >&2
  exit 1
fi

mkdir -p "$ROOT/dist"
cp -f "$OUT" "$ROOT/dist/rotaflow-pro-release.apk"
echo ""
echo "APK release pronto:"
echo "  $ROOT/dist/rotaflow-pro-release.apk"
ls -lh "$ROOT/dist/rotaflow-pro-release.apk"
