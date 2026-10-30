"""Exercise the bundled worker on real Chinese images, scanned and digital PDFs."""

import base64
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch

import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont

WORKER = Path(sys.argv[1]).resolve()
CHINESE = "\u529e\u516c\u6587\u6863\u8bc6\u522b\u6d4b\u8bd5"
ENGLISH = "Invoice Total 12345"


def fixture_documents(root):
    font_path = Path(os.environ.get("SystemRoot", "C:/Windows")) / "Fonts/msyh.ttc"
    if not font_path.is_file():
        raise RuntimeError("Chinese OCR smoke requires the Windows Microsoft YaHei font")
    image = Image.new("RGB", (1000, 320), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(font_path), 44)
    draw.text((40, 40), CHINESE, fill="black", font=font)
    draw.text((40, 145), ENGLISH, fill="black", font=font)
    image.save(root / "chinese.png")
    image.save(root / "scan.pdf", save_all=True, append_images=[image], resolution=100)
    with pdfium.PdfDocument.new() as pdf:
        page = pdf.new_page(600, 800)
        raw_text = pdfium.raw.FPDFPageObj_NewTextObj(pdf, b"Helvetica", 20)
        encoded = ctypes.create_string_buffer((ENGLISH + "\0").encode("utf-16-le"))
        assert pdfium.raw.FPDFText_SetText(raw_text, ctypes.cast(encoded, ctypes.POINTER(ctypes.c_ushort)))
        pdfium.raw.FPDFPageObj_Transform(raw_text, 1, 0, 0, 1, 50, 700)
        pdfium.raw.FPDFPage_InsertObject(page, raw_text)
        assert pdfium.raw.FPDFPage_GenerateContent(page)
        pdf.save(root / "text.pdf")
        page.close()


def recognize(file, **overrides):
    job = {
        "id": "1", "mode": "recognize", "input": "snapshot" + file.suffix,
        "inputBase64": base64.b64encode(file.read_bytes()).decode("ascii"),
        "dpi": 150, "maxPixels": 12000000, "maxPages": 50,
        "merge": {"removePageNumbers": False, "removeRunningHeads": False,
                  "joinAcrossPages": False, "joinWrappedLines": False, "detectHeadings": False},
        **overrides,
    }
    completed = subprocess.run(
        [sys.executable, "-I", "-B", str(WORKER)],
        input=json.dumps({"engineLifetime": "perDocument", "jobs": [job]}),
        capture_output=True, encoding="utf-8", timeout=90,
        env={**os.environ, "HTTP_PROXY": "http://127.0.0.1:9", "HTTPS_PROXY": "http://127.0.0.1:9"},
    )
    events = [json.loads(line) for line in completed.stdout.splitlines() if line.strip()]
    assert events, completed.stderr
    return events


if len(sys.argv) == 4 and sys.argv[2] == "--fixtures-only":
    fixture_documents(Path(sys.argv[3]))
    sys.exit(0)

with tempfile.TemporaryDirectory(prefix="anyong-ocr-smoke-") as temporary:
    root = Path(temporary)
    fixture_documents(root)
    for filename, pages, method in [("chinese.png", 1, "ocr"), ("scan.pdf", 2, "ocr"), ("text.pdf", 1, "text")]:
        events = recognize(root / filename)
        end = next(event for event in events if event["event"] == "end")
        assert end["failures"] == [], end
        page_events = [event for event in events if event["event"] == "page"]
        assert len(page_events) == pages, events
        assert all(event["method"] == method for event in page_events), page_events
        for page in page_events:
            assert ENGLISH.replace(" ", "") in page["text"].replace(" ", ""), page["text"]
            if method == "ocr":
                assert CHINESE in page["text"].replace(" ", ""), page["text"]
        print(f"{filename}: {pages} page(s), {method}, text verified")

    denied = recognize(root / "scan.pdf", maxPages=1, pages="1-2")
    assert next(event for event in denied if event["event"] == "end")["failures"]
    (root / "corrupt.pdf").write_bytes(b"not a pdf")
    invalid = recognize(root / "corrupt.pdf")
    assert next(event for event in invalid if event["event"] == "end")["failures"]

    # Model deletion must fail locally before the engine can invoke its downloader.
    spec = importlib.util.spec_from_file_location("ocr_worker", WORKER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with patch.object(Path, "is_file", return_value=False):
        try:
            module.Engine()
            raise AssertionError("missing model was accepted")
        except RuntimeError as error:
            assert "missing or corrupt" in str(error)
    print("Page limits, corrupt PDF and missing-model failure verified")
