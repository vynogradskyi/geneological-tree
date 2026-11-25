"""Use exactly the same family-area layout as the browser editor."""
import json
from pathlib import Path
import subprocess


def create_layout(data, output_dir=None, presentation=None):
    runner=Path(__file__).with_name('layout_runner.cjs')
    request={'data':data,'presentation':presentation} if presentation else data
    result=subprocess.run(['node',str(runner)],input=json.dumps(request,ensure_ascii=False),text=True,capture_output=True)
    if result.returncode:
        raise ValueError(result.stderr.strip() or 'Nie udało się obliczyć układu.')
    return json.loads(result.stdout)
