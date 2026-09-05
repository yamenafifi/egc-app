"""
ZATCA QR Code Decoder
=======================
Saudi Arabia's e-invoicing regulation (ZATCA, Phase 1 "simplified tax
invoice") requires every receipt to carry a QR code whose payload is a
Base64-encoded TLV (Tag-Length-Value) structure. Per the published spec,
the five standard tags are:

    1 = seller name              (UTF-8)
    2 = seller VAT registration  (UTF-8)
    3 = invoice timestamp        (UTF-8, ISO 8601)
    4 = invoice total w/ VAT     (UTF-8, numeric string)
    5 = VAT total                (UTF-8, numeric string)

This is deterministic byte parsing, not something to leave to an LLM's
interpretation - gemini_service.py's job is only to transcribe the raw
string a barcode scanner would read off the QR (zatca_qr_raw); decoding
that into trustworthy structured fields happens here.
"""

import base64

TAG_NAMES = {
    1: "seller_name",
    2: "vat_number",
    3: "timestamp",
    4: "invoice_total",
    5: "vat_total",
}


class ZatcaDecodeError(Exception):
    pass


def decode_zatca_qr(raw: str) -> dict:
    """Decodes a ZATCA simplified-tax-invoice QR payload. Raises
    ZatcaDecodeError with a human-readable reason on anything that isn't
    a well-formed TLV blob - a garbled photo of a QR code, a non-ZATCA QR,
    or a scanner mis-transcription should surface clearly, not silently
    produce wrong data."""
    if not raw or not raw.strip():
        raise ZatcaDecodeError("No QR value to decode.")

    try:
        data = base64.b64decode(raw.strip(), validate=True)
    except Exception as e:
        raise ZatcaDecodeError(f"Not valid Base64: {e}")

    fields = {}
    i = 0
    while i < len(data):
        if i + 2 > len(data):
            raise ZatcaDecodeError("Truncated TLV header - QR data may be incomplete.")
        tag, length = data[i], data[i + 1]
        i += 2
        if i + length > len(data):
            raise ZatcaDecodeError("Truncated TLV value - QR data may be incomplete.")
        value = data[i:i + length]
        i += length
        name = TAG_NAMES.get(tag)
        if name:
            fields[name] = value.decode("utf-8", errors="replace")

    if not fields:
        raise ZatcaDecodeError("No recognized ZATCA tags found - this may not be a ZATCA QR code.")

    for money_field in ("invoice_total", "vat_total"):
        if money_field in fields:
            try:
                fields[money_field] = float(fields[money_field])
            except ValueError:
                pass  # leave as the raw string rather than dropping it

    return fields
