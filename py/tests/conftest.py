from pathlib import Path

import pytest

from shadow_hull import load_font

# py/tests/conftest.py -> py/tests -> py -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
FONT_PATH = REPO_ROOT / "fonts" / "ArchivoBlack-Regular.ttf"


@pytest.fixture(scope="session")
def font():
    return load_font(FONT_PATH)
