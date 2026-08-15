
import zipfile, pathlib
root = pathlib.Path(r'''C:\\Users\\cane\\Desktop\\BusCommand-ca-monthly-import''')
zip_path = pathlib.Path(r'''C:\\Users\\cane\\Desktop\\BusCommand-ca-monthly-import\\reports\\phase-2r-a2-review-source-2026-08-09.zip''')
list_path = pathlib.Path(r'''C:\\Users\\cane\\Desktop\\BusCommand-ca-monthly-import\\reports\\_phase2r-a2-review-list.txt''')
files = [line.strip() for line in list_path.read_text(encoding='utf-8').splitlines() if line.strip()]
if zip_path.exists():
    zip_path.unlink()
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for rel in files:
        abs_path = root / rel
        if not abs_path.is_file():
            continue
        # Force forward-slash ZIP entry paths (no Windows backslashes).
        arc = rel.replace('\\', '/')
        zf.write(abs_path, arcname=arc)
print('wrote', zip_path, 'entries', len(zf.namelist()), 'bytes', zip_path.stat().st_size)
print('sample', zf.namelist()[:3])
