from pathlib import Path
import sys
files = sorted((Path(__file__).resolve().parents[1] / 'public' / 'scripts').glob('*.pine'))
if not files:
    sys.exit('No Pine scripts found')
failed = [str(file) for file in files if not file.read_text().lstrip().startswith('//@version=6')]
if failed:
    sys.exit('Pine v6 required: ' + ', '.join(failed))
print(f'Checked {len(files)} Pine Script v6 file(s).')
