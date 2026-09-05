"""
Gemini Receipt Extraction Service
===================================
The only step of the Expense Claim pipeline that talks to Google rather
than ERPNext/egc_hr. Given the original, unsplit receipts PDF, asks
Gemini to (a) identify which page range belongs to which receipt - a
receipt may span multiple pages or appear out of order in the PDF - and
(b) extract every field an Accountant needs to review: vendor/amounts/
line items/category/our-VAT-presence. Gemini cannot return a PDF itself,
only JSON/text - the actual page-range splitting into one PDF per
receipt happens in app/api/expense_claims.py via pypdf, using the page
numbers this returns.

Gemini is NOT asked to read the ZATCA QR code any more - that used to be
here (a "transcribe it like a barcode scanner" instruction) and it never
worked reliably: a QR code is a dense binary module grid, not natural
image content a vision-language model is trained to read back character
by character. app/services/qr_scanner.py decodes it deterministically
instead, straight from the rendered page pixels with OpenCV, entirely
independent of this module.

Non-negotiable: any field Gemini can't determine confidently comes back
null with a reason in confidence_notes, never a guessed number - this
data feeds a real accounting record.
"""

import base64
import time

import requests

from config.settings import Config

API_BASE = "https://generativelanguage.googleapis.com/v1beta"
REQUEST_TIMEOUT = 300  # PDF + multi-receipt extraction is not a sub-second call, and this
# runs off a background job with no HTTP-facing deadline (job_queue.py) - a real 180s ceiling
# was too tight, we've seen a genuine extraction alone take the full 180s and get cut off
# under upstream load.
MAX_PDF_BYTES = 45 * 1024 * 1024  # Gemini's own inline-data request size ceiling
MAX_ATTEMPTS = 3  # Gemini's own capacity is flaky enough in practice (429/503 "high demand",
# and slow responses that time out) that a single try isn't reliable - retry transient
# failures with backoff before giving up and surfacing job_status="failed" to the user.
# Worst case (all 3 attempts time out) is ~16 minutes - expense_claims.py's
# STALE_JOB_MINUTES is set with real headroom above that on purpose, so don't raise
# either constant without checking the other.
RETRY_BACKOFF_SECONDS = (5, 20)
RETRYABLE_STATUS_CODES = {429, 500, 503, 504}


class GeminiError(Exception):
    pass


BASE_PROMPT = """You are extracting structured data from a PDF that contains one or more \
purchase receipts/invoices, submitted by an employee for expense reimbursement in Saudi Arabia.

The PDF may contain multiple receipts. A single receipt may span two or more consecutive pages \
(e.g. a long itemized list, or a receipt photographed front-and-back on separate pages), and \
receipts may not be in any particular order. Your job:

1. Identify every distinct receipt in the PDF and the exact 1-indexed page range (page_start, \
page_end, inclusive) each one occupies. Do not split one physical receipt across two entries, \
and do not merge two different receipts into one entry.

2. For each receipt, extract directly from the printed text: vendor_name, vat_number, \
receipt_number, receipt_date (YYYY-MM-DD), subtotal_amount (before VAT/discount), discount_amount \
(0 if none stated), vat_amount, total_amount (final amount paid, VAT-inclusive). vat_number here \
means the VENDOR's own VAT registration number as printed on the receipt - see the separate \
instruction below about a DIFFERENT VAT number to look for.

3. For each receipt, also extract every individual line item shown (each product/service billed \
separately) into line_items: description, quantity (default 1 if not stated), unit_price, and \
line_total. Skip this entirely (empty array) if the receipt has no itemized breakdown - never \
fabricate line items for a receipt that only shows a single total.

4. Write description_en and description_ar: a short (under 15 words), specific, human-readable \
description of what was purchased and from where, in English and Arabic respectively. These two \
fields are a WRITING task, not an extraction task - always fill them in your own words from \
whatever the receipt shows, even if some numeric fields below are uncertain.
{category_block}
{vat_block}
7. For every OTHER field (amounts, vendor_name, vat_number, receipt_number, receipt_date, \
line item amounts): if you cannot determine it with real confidence - illegible, cut off, \
ambiguous currency - set it to null and say exactly why in confidence_notes. Never guess a \
number or invent a value. confidence_notes should be null if you are confident about everything \
on that receipt.

Return your findings as JSON matching the provided schema exactly - one object per receipt, in \
the order the receipts appear in the PDF."""

CATEGORY_BLOCK_WITH_OPTIONS = """
5. Assign expense_category: read each category's description below and pick the single one that \
best matches what this receipt is for, returning its exact name. If none of them clearly fit, or \
the receipt is too ambiguous to classify confidently, return null - never force a bad fit.
Available categories:
{category_list}
"""

CATEGORY_BLOCK_EMPTY = """
5. No expense categories are configured - always set expense_category to null.
"""

VAT_BLOCK_WITH_NUMBER = """
6. Separately from vat_number above (the VENDOR's own VAT number), check whether OUR company's \
VAT registration number - {company_vat_number} - appears ANYWHERE on this receipt (e.g. as a \
"Buyer VAT No" / customer tax number field, common on formal B2B tax invoices). Set \
our_vat_number_present to true only if you can actually see that exact number printed on the \
receipt; false if it's absent or you're not sure. This is a compliance flag, so a false negative \
is far safer than a false positive - when genuinely unsure, use false.
"""

VAT_BLOCK_EMPTY = """
6. No company VAT number is configured - always set our_vat_number_present to false.
"""


def _build_prompt(categories: list[dict] | None, company_vat_number: str | None) -> str:
    if categories:
        category_list = "\n".join(f'- "{c["name"]}": {c["description"]}' for c in categories)
        category_block = CATEGORY_BLOCK_WITH_OPTIONS.format(category_list=category_list)
    else:
        category_block = CATEGORY_BLOCK_EMPTY

    if company_vat_number:
        vat_block = VAT_BLOCK_WITH_NUMBER.format(company_vat_number=company_vat_number)
    else:
        vat_block = VAT_BLOCK_EMPTY

    return BASE_PROMPT.format(category_block=category_block, vat_block=vat_block)


def _build_schema(categories: list[dict] | None) -> dict:
    category_field = {"type": "STRING", "nullable": True}
    if categories:
        category_field["enum"] = [c["name"] for c in categories]

    return {
        "type": "OBJECT",
        "properties": {
            "receipts": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "page_start": {"type": "INTEGER"},
                        "page_end": {"type": "INTEGER"},
                        "vendor_name": {"type": "STRING", "nullable": True},
                        "vat_number": {"type": "STRING", "nullable": True},
                        "receipt_number": {"type": "STRING", "nullable": True},
                        "receipt_date": {"type": "STRING", "nullable": True},
                        "subtotal_amount": {"type": "NUMBER", "nullable": True},
                        "discount_amount": {"type": "NUMBER", "nullable": True},
                        "vat_amount": {"type": "NUMBER", "nullable": True},
                        "total_amount": {"type": "NUMBER", "nullable": True},
                        "expense_category": category_field,
                        "our_vat_number_present": {"type": "BOOLEAN"},
                        "line_items": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "description": {"type": "STRING"},
                                    "quantity": {"type": "NUMBER", "nullable": True},
                                    "unit_price": {"type": "NUMBER", "nullable": True},
                                    "line_total": {"type": "NUMBER", "nullable": True},
                                },
                                "required": ["description"],
                            },
                        },
                        "description_en": {"type": "STRING"},
                        "description_ar": {"type": "STRING"},
                        "confidence_notes": {"type": "STRING", "nullable": True},
                    },
                    "required": [
                        "page_start", "page_end", "description_en", "description_ar",
                        "our_vat_number_present",
                    ],
                },
            },
        },
        "required": ["receipts"],
    }


def extract_receipts(
    pdf_bytes: bytes,
    categories: list[dict] | None = None,
    company_vat_number: str | None = None,
) -> dict:
    """Returns {"receipts": [...]} per _build_schema() above. `categories`
    is the current expense_categories list ({"name", "description"} per
    entry) and `company_vat_number` the configured VAT number to look
    for - both optional, both baked into the prompt/schema dynamically
    per call since either can change at any time via Settings. Raises
    GeminiError on any failure (not configured, unreachable, malformed
    response) - the caller (app/api/expense_claims.py) is responsible
    for leaving the application in a retryable state, never stuck."""
    if not Config.GEMINI_ENABLED or not Config.GEMINI_API_KEY:
        raise GeminiError("Gemini is not configured (GEMINI_ENABLED/GEMINI_API_KEY).")
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise GeminiError(
            f"Receipts PDF is {len(pdf_bytes) / 1024 / 1024:.1f}MB, over the "
            f"{MAX_PDF_BYTES // 1024 // 1024}MB limit Gemini accepts inline."
        )

    url = f"{API_BASE}/models/{Config.GEMINI_MODEL}:generateContent"
    body = {
        "contents": [{
            "parts": [
                {"text": _build_prompt(categories, company_vat_number)},
                {"inline_data": {
                    "mime_type": "application/pdf",
                    "data": base64.b64encode(pdf_bytes).decode("ascii"),
                }},
            ],
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _build_schema(categories),
        },
    }

    resp = None
    pending_error = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        pending_error = None
        started = time.monotonic()
        try:
            resp = requests.post(
                url,
                headers={"Content-Type": "application/json", "X-goog-api-key": Config.GEMINI_API_KEY},
                json=body,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            print(f"[gemini] attempt {attempt}/{MAX_ATTEMPTS} responded in {time.monotonic() - started:.1f}s")
            break
        except requests.exceptions.ConnectionError:
            print(f"[gemini] attempt {attempt}/{MAX_ATTEMPTS} connection error after {time.monotonic() - started:.1f}s")
            pending_error = GeminiError("Cannot connect to Gemini.")
        except requests.exceptions.Timeout:
            print(f"[gemini] attempt {attempt}/{MAX_ATTEMPTS} timed out after {time.monotonic() - started:.1f}s (limit {REQUEST_TIMEOUT}s)")
            pending_error = GeminiError("Gemini request timed out.")
        except requests.exceptions.HTTPError:
            print(f"[gemini] attempt {attempt}/{MAX_ATTEMPTS} HTTP {resp.status_code} after {time.monotonic() - started:.1f}s")
            if resp.status_code not in RETRYABLE_STATUS_CODES:
                raise GeminiError(f"Gemini returned {resp.status_code}: {resp.text}")
            pending_error = GeminiError(f"Gemini returned {resp.status_code}: {resp.text}")

        if attempt < MAX_ATTEMPTS:
            time.sleep(RETRY_BACKOFF_SECONDS[attempt - 1])

    if pending_error:
        raise pending_error

    try:
        data = resp.json()
        # usageMetadata is the only real evidence of where the wall-clock time went
        # (input processing vs. a model "thinking" budget vs. output generation) -
        # log it so a slow run is diagnosable from the server console instead of guessed at.
        usage = data.get("usageMetadata", {})
        print(f"[gemini] token usage: prompt={usage.get('promptTokenCount')} "
              f"thinking={usage.get('thoughtsTokenCount')} output={usage.get('candidatesTokenCount')} "
              f"total={usage.get('totalTokenCount')}")
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        import json
        parsed = json.loads(text)
    except (KeyError, IndexError, ValueError) as e:
        raise GeminiError(f"Gemini returned an unparseable response: {e}")

    if not isinstance(parsed, dict) or not isinstance(parsed.get("receipts"), list):
        raise GeminiError("Gemini's response did not match the expected {receipts: [...]} shape.")

    return parsed
