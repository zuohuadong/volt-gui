"""Validate the bundled interpreter, native modules and editable Office files."""

import importlib.metadata
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import xml.parsers.expat
import lzma
import ssl
import sqlite3

import duckdb
import numpy as np
from python_calamine import CalamineWorkbook
import pandas as pd
from docx import Document
from openpyxl import Workbook, load_workbook
from PIL import Image
from pptx import Presentation
from pptx.util import Inches
import xlsxwriter

for name, version in json.loads(sys.argv[1]).items():
    assert importlib.metadata.version(name) == version, name
assert np.arange(4).sum() == 6
assert pd.DataFrame({"value": [1, 2]}).value.sum() == 3
assert sqlite3.connect(":memory:").execute("select 1").fetchone() == (1,)
assert lzma.decompress(lzma.compress(b"offline")) == b"offline"
ssl.create_default_context()

with tempfile.TemporaryDirectory(prefix="anyong-office-") as directory:
    root = Path(directory)
    document = Document()
    document.add_paragraph("Bundled document")
    document.save(root / "sample.docx")
    assert Document(root / "sample.docx").paragraphs[0].text == "Bundled document"

    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    slide.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1)).text = "Bundled slide"
    presentation.save(root / "sample.pptx")
    assert Presentation(root / "sample.pptx").slides[0].shapes[0].text == "Bundled slide"

    workbook = Workbook()
    workbook.active.append(["value"])
    workbook.active.append([42])
    workbook.save(root / "sample.xlsx")
    restored = load_workbook(root / "sample.xlsx")
    assert restored.active["A2"].value == 42
    restored.close()
    assert pd.read_excel(root / "sample.xlsx").value.iloc[0] == 42

    # The sheet engine reads xlsx through openpyxl and aggregates through the
    # locked duckdb wheel; verify that exact path stays offline-capable.
    sheets_csv = root / "rows.csv"
    with sheets_csv.open("w", encoding="utf-8", newline="") as handle:
        handle.write("dept,amount\n")
        for index in range(1000):
            handle.write(f"d{index % 7},{index}\n")
    connection = duckdb.connect(database=":memory:")
    connection.execute("SET memory_limit='256MB'")
    connection.execute("SET threads=2")
    connection.execute(
        "CREATE TABLE data AS SELECT * FROM read_csv_auto("
        f"'{sheets_csv.as_posix()}', header=true, sample_size=100000)"
    )
    assert connection.execute("SELECT SUM(amount) FROM data").fetchone()[0] == 499500
    connection.execute("SET enable_external_access=false")
    connection.close()

    # The fast xlsx reader is a separate wheel; prove it streams the same values.
    calamine_book = CalamineWorkbook.from_path(str(root / "sample.xlsx"))
    calamine_rows = list(calamine_book.get_sheet_by_name("Sheet").iter_rows())
    assert calamine_rows[0][0] == "value"
    assert calamine_rows[1][0] == 42
    with xlsxwriter.Workbook(root / "writer.xlsx") as writer:
        writer.add_worksheet().write("A1", "editable")

    Image.new("RGB", (40, 20), "red").save(root / "sample.png")
    with Image.open(root / "sample.png") as image:
        assert image.size == (40, 20)

    venv = root / "project venv"
    # The stripped standalone runtime intentionally omits ensurepip; test the
    # isolated interpreter without asking it to bootstrap a second pip copy.
    subprocess.run([sys.executable, "-I", "-B", "-m", "venv", "--without-pip", str(venv)],
                   check=True, timeout=60)
    subprocess.run([str(venv / "Scripts" / "python.exe"), "-I", "-B", "-c",
                    "import sys; assert sys.prefix != sys.base_prefix"],
                   check=True, timeout=15)

print("Bundled Python libraries and document round trips passed.")
