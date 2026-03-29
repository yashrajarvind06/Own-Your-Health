import re
from datetime import datetime
from pathlib import Path

import pytesseract
from PIL import Image

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

TESSERACT_CONFIG = "--oem 3 --psm 6"
poppler_path=r"C:\Users\yashr\Downloads\Release-25.12.0\poppler-25.12.0\Library\bin"


def extract_text_from_image(file_path: str) -> str:
    try:
        img = Image.open(file_path)
        text = pytesseract.image_to_string(img, config=TESSERACT_CONFIG)
        return text.strip()
    except Exception:
        return ""


def extract_text_from_pdf(file_path: str) -> str:
    import pdfplumber
    from pdf2image import convert_from_path

    text = ""

    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""
    except Exception:
        pass

    if not text.strip():
        try:
            images = convert_from_path(
                file_path,
                poppler_path=r"C:\poppler\Library\bin",
            )

            for img in images:
                text += pytesseract.image_to_string(
                    img,
                    config=TESSERACT_CONFIG,
                )
        except Exception:
            return ""

    return text.strip()


def clean_text(raw_text: str) -> str:
    cleaned = (raw_text or "").lower()
    replacements = {
        "b1ood": "blood",
        "rete": "rate",
        "gluco5e": "glucose",
        "heort": "heart",
        "spm": "bpm",
        "meg/dl": "mg/dl",
    }
    for source, target in replacements.items():
        cleaned = cleaned.replace(source, target)

    cleaned = re.sub(r"[^a-z0-9\s\/\.\:\-]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def extract_report_date(raw_text: str) -> str | None:
    patterns = [
        r"(\d{2}/\d{2}/\d{4})",
        r"(\d{1,2}/\d{1,2}/\d{4})",
        r"(\d{2}-[A-Za-z]{3}-\d{4})",
        r"(\d{4}-\d{2}-\d{2})",
    ]

    for pattern in patterns:
        match = re.search(pattern, raw_text)
        if match:
            return match.group(1)

    return None


def parse_date(date_str: str) -> datetime | None:
    formats = [
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%b-%Y",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except Exception:
            continue

    return None


def extract_bp(text: str) -> tuple[int | None, int | None]:
    match = re.search(r"(\d{2,3})\s*/\s*(\d{2,3})", text)
    if match:
        sys = int(match.group(1))
        dia = int(match.group(2))
        if 70 <= sys <= 250 and 40 <= dia <= 150:
            return sys, dia
    return None, None


def extract_heart_rate(text: str) -> int | None:
    match = re.search(r"(?:heart|heort|pulse)[^\d]{0,20}(\d{2,3})", text)
    if match:
        val = int(match.group(1))
        if 30 <= val <= 220:
            return val
    return None


def extract_glucose(text: str) -> int | None:
    match = re.search(r"(?:glucose|blood sugar)[^\d]{0,20}(\d{2,3})", text)
    if match:
        val = int(match.group(1))
        if 50 <= val <= 500:
            return val
    return None


def extract_structured_data(cleaned_text: str) -> dict[str, int | None]:
    bp_systolic, bp_diastolic = extract_bp(cleaned_text)
    heart_rate = extract_heart_rate(cleaned_text)
    glucose = extract_glucose(cleaned_text)
    data = {
        "bp_systolic": bp_systolic,
        "bp_diastolic": bp_diastolic,
        "heart_rate": heart_rate,
        "glucose": glucose,
    }
    print("FINAL STRUCTURED DATA:", data)
    return data


def _normalize_match(value: str | None, capitalize: bool = False) -> str | None:
    if not value:
        return None
    normalized = re.sub(r"\s+", " ", value).strip(" .:-")
    if not normalized:
        return None
    return normalized.capitalize() if capitalize else normalized


def detect_handwritten(raw_text: str, cleaned_text: str) -> bool:
    words = re.findall(r"[a-z0-9]+", cleaned_text)
    if len(words) < 6:
        return True

    alnum_count = len(re.findall(r"[a-z0-9]", cleaned_text))
    if alnum_count == 0:
        return True

    alpha_count = len(re.findall(r"[a-z]", cleaned_text))
    if alpha_count / alnum_count < 0.6:
        return True

    raw_lines = [line.strip() for line in (raw_text or "").splitlines() if line.strip()]
    if raw_lines and len(max(raw_lines, key=len)) < 12:
        return True

    return False


def detect_report_type(cleaned_text: str) -> str | None:
    t = cleaned_text.lower()

    if "blood pressure" in t or "lab report" in t or "test report" in t:
        return "LAB"

    if "prescription" in t or "rx" in t:
        return "PRESCRIPTION"

    if "discharge" in t or "procedure" in t or "surgery" in t:
        return "DISCHARGE"

    if "x-ray" in t or "xray" in t:
        return "XRAY"

    return None


def extract_condition(raw_text: str, cleaned_text: str, report_type: str | None) -> str | None:
    t = cleaned_text.lower()

    # 🔥 BLOOD PRESSURE / LAB
    if "blood pressure" in t or "bp" in t:
        if "high" in t:
            return "High blood pressure"
        return "Blood pressure report"

    if "blood test" in t:
        return "Blood test"

    # 🔥 PRESCRIPTION
    if report_type == "PRESCRIPTION":
        if "fever" in t:
            return "Fever treatment"
        if "infection" in t:
            return "Infection treatment"
        return "General prescription"

    # 🔥 SURGERY / DISCHARGE (CRITICAL)
    if report_type == "DISCHARGE":
        match = re.search(r"procedure[:\s]*([a-zA-Z\s\(\)]+)", raw_text, re.IGNORECASE)
        if match:
            return match.group(1).strip()

        if "bypass" in t or "cabg" in t:
            return "Heart surgery"

        return "Surgical procedure"

    # 🔥 XRAY
    if report_type == "XRAY":
        if "chest" in t:
            return "Chest X-ray"
        return "X-ray report"

    return None

def extract_source(raw_text: str, cleaned_text: str) -> str | None:
    t = raw_text.lower()

    if "diagnostic laboratory" in t:
        match = re.search(r"([A-Z][A-Za-z\s]+Diagnostic Laboratory)", raw_text)
        if match:
            return match.group(1).strip()

    if "laboratory" in t:
        match = re.search(r"([A-Z][A-Za-z\s]+Laboratory)", raw_text)
        if match:
            return match.group(1).strip()

    # 🔥 Detect common hospital keywords
    if "medical center" in t:
        match = re.search(r"([A-Z][a-zA-Z\s]+Medical Center)", raw_text)
        if match:
            return match.group(1).strip()

    if "hospital" in t:
        match = re.search(r"([A-Z][a-zA-Z\s]+Hospital)", raw_text)
        if match:
            return match.group(1).strip()

    if "diagnostics" in t:
        match = re.search(r"([A-Z][a-zA-Z\s]+Diagnostics)", raw_text)
        if match:
            return match.group(1).strip()

    return None

def generate_report_summary(raw_text: str, cleaned_text: str) -> tuple[str | None, str | None, str | None, bool]:
    if detect_handwritten(raw_text, cleaned_text):
        return "Handwritten prescription", None, None, True

    report_type = detect_report_type(cleaned_text)
    condition = extract_condition(raw_text, cleaned_text, report_type)
    source = extract_source(raw_text, cleaned_text)
    print("DEBUG → REPORT TYPE:", report_type)
    print("DEBUG → CONDITION:", condition)
    print("DEBUG → SOURCE:", source)

    if report_type == "PRESCRIPTION":
     return "Handwritten prescription", report_type, None, True

    if report_type == "LAB":
        if not condition or not source:
            return None, report_type, condition, False
        return f"{condition} - {source}", report_type, condition, False

    if report_type == "DISCHARGE":
        if not condition:
            return None, report_type, condition, False
        return f"{condition} discharge", report_type, condition, False

    if report_type == "XRAY":
        if not condition:
            return None, report_type, condition, False
        return condition, report_type, condition, False

    return None, report_type, condition, False

def extract_report_data(file_path: str, mime_type: str | None) -> dict[str, object]:
    suffix = Path(file_path).suffix.lower()
    raw_text = ""

    if mime_type == "application/pdf" or suffix == ".pdf":
        raw_text = extract_text_from_pdf(file_path)
    else:
        raw_text = extract_text_from_image(file_path)

    print("OCR RAW TEXT:", raw_text)
    cleaned_text = clean_text(raw_text)
    structured = extract_structured_data(cleaned_text)
    summary, report_type, condition, is_handwritten = generate_report_summary(raw_text, cleaned_text)
    report_date_str = extract_report_date(raw_text)
    report_date = parse_date(report_date_str) if report_date_str else None
    print("STRUCTURED DATA:", structured)
    print("OCR DATE:", report_date_str)
    print("PARSED DATE:", report_date)

    return {
        "raw_text": raw_text[:10000].strip(),
        "clean_text": cleaned_text,
        "structured": structured,
        "bp_systolic": structured.get("bp_systolic"),
        "bp_diastolic": structured.get("bp_diastolic"),
        "heart_rate": structured.get("heart_rate"),
        "glucose": structured.get("glucose"),
        "summary": summary,
        "report_type": report_type,
        "condition": condition,
        "is_handwritten": is_handwritten,
        "report_date_str": report_date_str,
        "report_date": report_date,
    }
