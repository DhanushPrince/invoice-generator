#!/usr/bin/env bash
# Builds dist/InvoiceExt.zip (Chrome Web Store upload) from extension/.
set -euo pipefail
cd "$(dirname "$0")/.."
cp NOTICE extension/NOTICE.txt
mkdir -p dist && rm -f dist/InvoiceExt.zip
(cd extension && python3 -c "
import zipfile,os
z=zipfile.ZipFile('../dist/InvoiceExt.zip','w',zipfile.ZIP_DEFLATED)
for r,_,fs in os.walk('.'):
  for f in sorted(fs): z.write(os.path.join(r,f), os.path.relpath(os.path.join(r,f),'.'))
z.close()")
echo "built dist/InvoiceExt.zip ($(du -h dist/InvoiceExt.zip | cut -f1))"
