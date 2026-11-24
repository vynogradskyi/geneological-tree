"""Create ignored demo records for a clean checkout; never replace family data."""
from pathlib import Path
import shutil


def initialize_example(root):
    root = Path(root)
    targets = [root/'family-tree.json', root/'family-tree-review.json']
    if all(path.exists() for path in targets):
        return False
    if any(path.exists() for path in targets):
        raise FileNotFoundError('Brakuje jednego z lokalnych plików danych. Nie zastąpiono istniejących danych przykładem.')
    source = Path(__file__).resolve().parents[1]/'examples'
    root.mkdir(parents=True, exist_ok=True)
    (root/'photos').mkdir(exist_ok=True)
    for name, target in zip(['family-tree.example.json', 'family-tree-review.example.json'], targets):
        shutil.copyfile(source/name, target)
    return True


if __name__ == '__main__':
    created = initialize_example(Path(__file__).resolve().parents[1])
    print('Utworzono lokalne dane demonstracyjne.' if created else 'Lokalne dane już istnieją — bez zmian.')
