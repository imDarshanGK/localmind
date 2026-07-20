import tempfile
import os
from services.csv_loader import CleanCSVLoader


def test_csv_parser_ignores_trailing_blank_rows():
    """Test that CSV parser removes trailing blank rows"""

    csv_content = """Name,Age,City
John,25,Delhi
Sarah,30,Mumbai
,
,
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        f.write(csv_content)
        temp_path = f.name

    try:
        loader = CleanCSVLoader(file_path=temp_path)
        docs = loader.load()

        assert len(docs) == 2, f"Expected 2 documents, got {len(docs)}"
        assert "John" in docs[0].page_content
        assert "Sarah" in docs[1].page_content

    finally:
        os.remove(temp_path)


def test_csv_parser_preserves_valid_data():
    """Test that valid data is not removed"""

    csv_content = """Name,Age
Alice,28
Bob,32
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        f.write(csv_content)
        temp_path = f.name

    try:
        loader = CleanCSVLoader(file_path=temp_path)
        docs = loader.load()

        assert len(docs) == 2

    finally:
        os.remove(temp_path)
