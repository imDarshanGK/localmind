"""
Custom CSV Loader that ignores trailing blank rows
"""
import csv
from typing import List
from langchain_core.documents import Document


class CleanCSVLoader:
    """
    CSV Loader that strips trailing blank rows before processing.
    """

    def __init__(self, file_path: str):
        self.file_path = file_path

    def load(self) -> List[Document]:
        """Load CSV and filter out trailing blank rows."""

        # Read CSV file
        with open(self.file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        # Remove trailing blank rows
        while rows:
            last_row = rows[-1]
            # Check if all values are empty/whitespace
            if all(value is None or str(value).strip() == '' for value in last_row.values()):
                rows.pop()
            else:
                break

        # Create Document objects from cleaned rows
        docs = []
        for idx, row in enumerate(rows):
            # Format row as text
            content = "\n".join([f"{key}: {value}" for key, value in row.items()])
            doc = Document(
                page_content=content,
                metadata={"source": self.file_path, "row": idx}
            )
            docs.append(doc)

        return docs