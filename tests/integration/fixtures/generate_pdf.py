"""
Generate a deterministic sample PDF for integration tests.

The PDF contains facts that the RAG pipeline will index.  When
a test asks "What is the capital of France?", the mock Ollama
server sees that keyword and returns "Paris" — verifying the
full upload → index → retrieve → chat pipeline.

Run once to (re)create the fixture:
    python tests/integration/fixtures/generate_pdf.py
"""

from pathlib import Path
from fpdf import FPDF, XPos, YPos


CONTENT = """\
LocalMind Integration Test Document
====================================

Section 1: Geography
---------------------
The capital of France is Paris.
The capital of Germany is Berlin.
The capital of Japan is Tokyo.
The capital of Australia is Canberra.
The capital of India is New Delhi.

Section 2: Science
------------------
Water is composed of hydrogen and oxygen molecules (H2O).
The speed of light in a vacuum is approximately 299,792,458 metres per second.
Photosynthesis is the process by which plants convert sunlight into energy.

Section 3: Technology
---------------------
Python is a high-level, interpreted programming language created by Guido van Rossum.
FastAPI is a modern web framework for building APIs with Python type hints.
LocalMind is a fully offline AI assistant that runs 100% on your local machine.
Docker is a platform for developing, shipping, and running containerised applications.

Section 4: History
------------------
The Apollo 11 mission landed astronauts on the Moon on July 20, 1969.
The World Wide Web was invented by Sir Tim Berners-Lee in 1989.
"""


def generate(output_path: Path) -> None:
    pdf = FPDF()
    pdf.set_margins(left=20, top=20, right=20)
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", size=16)
    pdf.cell(0, 10, "LocalMind Integration Test Document", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
    pdf.ln(4)

    pdf.set_font("Helvetica", size=11)
    for line in CONTENT.strip().splitlines():
        stripped = line.strip()
        if stripped.startswith("Section"):
            pdf.set_font("Helvetica", "B", size=13)
            pdf.ln(3)
            pdf.cell(0, 8, stripped, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("Helvetica", size=11)
        elif stripped.startswith("===") or stripped.startswith("---"):
            continue  # skip separators
        elif stripped:
            pdf.multi_cell(0, 7, stripped, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        else:
            pdf.ln(3)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(output_path))
    print(f"Generated: {output_path}  ({output_path.stat().st_size} bytes)")


if __name__ == "__main__":
    here = Path(__file__).parent
    generate(here / "sample.pdf")
