"""
Receipt QR Code Scanner
=========================
Deterministic ZATCA QR decoding straight off the receipt's rendered
pixels. This replaces an earlier design where Gemini was asked to
"transcribe" the QR code as text: that never worked reliably on real
receipts, because a QR code is a dense binary module grid, not natural
image content a vision-language model is trained to read character by
character - it isn't a barcode scanner, and asking an LLM to behave like
one just produces a best-guess string that usually failed
app/services/zatca.py's TLV parser.

A real computer-vision QR decoder against an actually-rasterized page
image is the fix: it's what a barcode scanner does under the hood, and
just as deterministic as the TLV parsing that consumes its output.
PyMuPDF renders each candidate page to pixels; OpenCV's QRCodeDetector
reads the code directly from those pixels - no LLM involved at all.
"""

import cv2
import numpy as np
import pymupdf

# Two render resolutions: most printed/scanned receipt QR codes decode
# fine at ~216 DPI (zoom 3x on a PDF's native 72 DPI unit), but a small or
# slightly blurry code sometimes only resolves at a higher pass.
ZOOM_LEVELS = (3, 5)


def _pixmap_to_bgr(pix) -> np.ndarray:
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        return cv2.cvtColor(arr, cv2.COLOR_RGBA2BGR)
    if pix.n == 1:
        return cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _decode_frame(detector, frame) -> str | None:
    data, points, _ = detector.detectAndDecode(frame)
    if data:
        return data
    # detectAndDecodeMulti catches codes the single-code path sometimes
    # misses on a busier page (multiple stamps/logos confusing the finder
    # pattern search) - cheap enough to always try as a second pass.
    try:
        ok, decoded_list, _, _ = detector.detectAndDecodeMulti(frame)
    except cv2.error:
        return None
    if ok:
        for d in decoded_list:
            if d:
                return d
    return None


def scan_for_qr(pdf_bytes: bytes, page_start: int, page_end: int) -> str | None:
    """Scans the 1-indexed inclusive page range (matches Gemini's own
    page_start/page_end for a receipt) for a QR code, at increasing
    render resolution. Returns the first payload string decoded, or None
    if no page in range yields one - never raises, since "no QR present"
    is an entirely normal outcome for plenty of real receipts."""
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        return None

    detector = cv2.QRCodeDetector()
    try:
        start = max(0, page_start - 1)
        end = min(page_end, len(doc))
        for page_num in range(start, end):
            page = doc[page_num]
            for zoom in ZOOM_LEVELS:
                pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
                frame = _pixmap_to_bgr(pix)
                decoded = _decode_frame(detector, frame)
                if decoded:
                    return decoded
        return None
    finally:
        doc.close()
