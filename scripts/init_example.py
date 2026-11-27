"""Create synthetic demo records in Data/ for a clean checkout; never replaces family data."""
from pathlib import Path
import shutil

import family_store

EXAMPLES = Path(__file__).resolve().parents[1] / 'examples'


def initialize_example(root):
    root = Path(root)
    targets = {family_store.information_path(root, 'pl'): 'family-tree.example.json',
               family_store.review_path(root): 'family-tree-review.example.json'}
    if all(path.exists() for path in targets):
        return False
    if any(path.exists() for path in targets):
        raise FileNotFoundError('Brakuje jednego z lokalnych plików danych w Data/. Nie zastąpiono istniejących danych przykładem.')
    (root / family_store.PHOTOS).mkdir(parents=True, exist_ok=True)
    for target, name in targets.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(EXAMPLES / name, target)
    return True


if __name__ == '__main__':
    created = initialize_example(Path(__file__).resolve().parents[1])
    print('Utworzono lokalne dane demonstracyjne w Data/.' if created else 'Lokalne dane już istnieją — bez zmian.')
