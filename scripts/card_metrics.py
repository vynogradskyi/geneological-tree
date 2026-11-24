"""Read the browser's shared metrics without duplicating dimensions in Python."""
import json
from pathlib import Path
TEXT=(Path(__file__).resolve().parents[1]/'web/card-metrics.js').read_text()
METRICS=json.loads(TEXT.removeprefix('window.GenealogyCardMetrics = ').strip().removesuffix(';'))
