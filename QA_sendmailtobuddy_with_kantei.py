
import os
import json
import base64
import time
import datetime
import threading

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # envファイルをインストールしない場合

app = Flask(__name__)

CORS(app, origins=[
    "https://github.com/Ori13598/buddy2",
])

SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")
MAIL_TO          = os.environ.get("MAIL_TO")
MAIL_FROM        = os.environ.get("MAIL_FROM")

GOOGLE_SERVICE_ACCOUNT_B64 = os.environ.get("GOOGLE_SERVICE_ACCOUNT_B64")
GOOGLE_SHEET_ID             = os.environ.get("GOOGLE_SHEET_ID")
SHEET_KANTEI  = "査定依頼"   # ← Google Sheet cần có tab cùng tên này

PROPERTY_TYPE_LABEL = {
    "sokochi": "底地",
    "akiya":   "空き家・空き地",
    "mansion": "一棟マンション",
}

# Bảng nhãn tương ứng với các <select> trong index.html / satei.js.
# Backend build lại "detail" text ở server-side dựa theo value gửi lên,
# nên bảng này phải khớp với option value/label trong index.html.
SOKOCHI_CONTRACT_LABEL = {
    "old": "旧法（普通借地権）",
    "new_general": "新法・普通借地権",
    "new_fixed": "定期借地権",
    "unknown": "わからない",
}
AKIYA_TYPE_LABEL = {
    "house": "建物あり（空き家）",
    "land": "建物なし（更地）",
    "both": "建物・土地とも所有",
    "unknown": "わからない",
}
AKIYA_AGE_LABEL = {
    "under10": "10年未満",
    "10to20": "10〜20年",
    "20to30": "20〜30年",
    "over30": "30年以上",
    "unknown": "わからない",
}
AKIYA_INHERITED_LABEL = {
    "yes": "相続財産である",
    "no": "相続財産ではない",
    "unknown": "わからない",
}
MANSION_OCCUPANCY_LABEL = {
    "full": "ほぼ満室（90%以上）",
    "high": "70〜90%くらい",
    "mid": "50〜70%くらい",
    "low": "50%未満",
    "unknown": "わからない",
}

# ---- Google Sheets（import trong hàm để khỏi bắt buộc cài gspread khi chỉ test local) ----
_gs_client = None
_gs_lock = threading.Lock()
_ws_cache = {}
_ws_cache_lock = threading.Lock()


def _get_gs_client():
    global _gs_client
    if _gs_client is None:
        with _gs_lock:
            if _gs_client is None:
                import gspread
                from google.oauth2.service_account import Credentials
                if not GOOGLE_SERVICE_ACCOUNT_B64:
                    raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_B64 が設定されていません")
                info = json.loads(base64.b64decode(GOOGLE_SERVICE_ACCOUNT_B64).decode("utf-8"))
                creds = Credentials.from_service_account_info(
                    info, scopes=["https://www.googleapis.com/auth/spreadsheets"]
                )
                _gs_client = gspread.authorize(creds)
    return _gs_client


def _get_worksheet(sheet_name):
    if sheet_name not in _ws_cache:
        with _ws_cache_lock:
            if sheet_name not in _ws_cache:
                client = _get_gs_client()
                _ws_cache[sheet_name] = client.open_by_key(GOOGLE_SHEET_ID).worksheet(sheet_name)
    return _ws_cache[sheet_name]


def append_row(sheet_name, row):
    if not GOOGLE_SHEET_ID:
        print(f"[GoogleSheets] GOOGLE_SHEET_ID chưa được set → bỏ qua (dry run). Row: {row}")
        return
    try:
        import gspread
        ws = _get_worksheet(sheet_name)
        col_a = ws.col_values(1)
        next_row = len(col_a) + 1
        end_col = gspread.utils.rowcol_to_a1(1, len(row)).rstrip("1")
        ws.update(f"A{next_row}:{end_col}{next_row}", [row], value_input_option="USER_ENTERED")
    except Exception as e:
        _ws_cache.pop(sheet_name, None)
        print(f"[GoogleSheets] Ghi vào '{sheet_name}' thất bại: {e}")


def append_row_async(sheet_name, row):
    threading.Thread(target=append_row, args=(sheet_name, row), daemon=True).start()


def now_jst():
    jst = datetime.timezone(datetime.timedelta(hours=9))
    return datetime.datetime.now(jst).strftime("%Y-%m-%d %H:%M:%S")


MIN_SUBMIT_MS = 2000  # phải khớp với MIN_SUBMIT_MS bên satei.js


def is_bot_request(form):
    if form.get("hp", ""):
        return True
    ts = form.get("ts", "")
    try:
        elapsed = time.time() * 1000 - float(ts)
        if elapsed < MIN_SUBMIT_MS:
            return True
    except (TypeError, ValueError):
        return True
    return False


MAX_LEN = {
    "name": 50, "phone": 20, "email": 100, "address": 300,
    "pref": 20, "city": 50, "town": 100, "chiban": 100,
    "message": 600, "detail": 1000,
}


def get_field(form, key, limit_key=None):
    val = form.get(key, "")
    limit = MAX_LEN.get(limit_key or key)
    return val[:limit] if limit else val


_http_session = requests.Session()


def send_email(subject, body, attachments=None):
    """Chưa cấu hình SendGrid thì không gửi thật, chỉ in ra console để test local."""
    if not SENDGRID_API_KEY or not MAIL_TO or not MAIL_FROM:
        print("=" * 60)
        print("[DRY RUN] Chưa cấu hình SendGrid nên KHÔNG gửi mail thật.")
        print(f"Subject: {subject}")
        print(body)
        if attachments:
            print(f"File đính kèm: {[a['filename'] for a in attachments]}")
        print("=" * 60)
        return

    payload = {
        "personalizations": [{"to": [{"email": MAIL_TO}]}],
        "from": {"email": MAIL_FROM},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }
    if attachments:
        payload["attachments"] = attachments

    res = _http_session.post(
        "https://api.sendgrid.com/v3/mail/send",
        json=payload,
        headers={"Authorization": f"Bearer {SENDGRID_API_KEY}"},
        timeout=15,
    )
    if res.status_code not in (200, 202):
        raise Exception(f"SendGrid error: {res.status_code}")


def build_detail_text(property_type, form):
    """
    Ghép câu trả lời STEP 2 (chi tiết theo từng loại BĐS) thành text cho email.
    satei.js gửi field riêng theo từng loại (sokochi_*, akiya_*, mansion_*)
    chứ KHÔNG gửi 1 field "detail" gộp sẵn — nên phải build ở đây.
    """
    if property_type == "sokochi":
        contract = SOKOCHI_CONTRACT_LABEL.get(form.get("sokochi_contract", ""), "未選択")
        rent = get_field(form, "sokochi_rent") or "未記入"
        return f"契約形態: {contract}\n現在の地代（目安）: {rent}"

    if property_type == "akiya":
        kind = AKIYA_TYPE_LABEL.get(form.get("akiya_type", ""), "未選択")
        age = AKIYA_AGE_LABEL.get(form.get("akiya_age", ""), "未選択")
        area = get_field(form, "akiya_area") or "未記入"
        inherited = AKIYA_INHERITED_LABEL.get(form.get("akiya_inherited", ""), "未選択")
        return (
            f"現況: {kind}\n"
            f"建物の築年数（目安）: {age}\n"
            f"土地面積（目安）: {area}\n"
            f"相続財産か: {inherited}"
        )

    if property_type == "mansion":
        units = get_field(form, "mansion_units") or "未記入"
        occupancy = MANSION_OCCUPANCY_LABEL.get(form.get("mansion_occupancy", ""), "未選択")
        income = get_field(form, "mansion_income") or "未記入"
        return (
            f"総戸数（目安）: {units}\n"
            f"入居率（目安）: {occupancy}\n"
            f"年間家賃収入（目安）: {income}"
        )

    return "（物件の詳細情報は未入力）"


@app.route("/api/kantei", methods=["OPTIONS", "POST"])
def kantei():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    if is_bot_request(request.form):
        # ボットとみなした場合はフロント側同様、成功したふりをして終わらせる
        return jsonify({"success": True}), 200

    property_type = request.form.get("property_type", "")
    type_label = PROPERTY_TYPE_LABEL.get(property_type, property_type or "不明")

    name  = get_field(request.form, "name")
    phone = get_field(request.form, "phone")
    email = get_field(request.form, "email")

    # フロント側で必須チェック済みだが、サーバー側でも最低限のバリデーションを行う
    if not name or (not phone and not email):
        return jsonify({
            "success": False,
            "error": "お名前と、電話番号またはメールアドレスをご入力ください"
        }), 400

    pref    = get_field(request.form, "pref")
    city    = get_field(request.form, "city")
    town    = get_field(request.form, "town")
    chiban  = get_field(request.form, "chiban")
    address = get_field(request.form, "address")
    message = get_field(request.form, "message")
    detail  = build_detail_text(property_type, request.form)

    address_line = f"{pref}{city}{town}".strip() or "-"

    subject = f"【ホームページから】【査定依頼】{type_label} {name} 様"
    body = f"""
物件種別: {type_label}

お名前: {name}
電話番号: {phone or "-"}
メール: {email or "-"}

所在地: {address_line}
地番・号など: {chiban or "-"}
ご住所（連絡先）: {address or "-"}

{detail}

ご相談内容・備考:
{message or "-"}
""".strip()

    attachments = []
    filenames = []
    for f in request.files.getlist("files"):
        if f and f.filename:
            attachments.append({
                "content":     base64.b64encode(f.read()).decode("utf-8"),
                "filename":    f.filename,
                "type":        f.content_type or "application/octet-stream",
                "disposition": "attachment",
            })
            filenames.append(f.filename)

    if not filenames:
        filenames.append("-")

    append_row_async(SHEET_KANTEI, [
        now_jst(), type_label, name, phone, email,
        address_line, chiban, address, detail, message, ", ".join(filenames)
    ])

    try:
        send_email(subject, body, attachments if attachments else None)
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/", methods=["GET"])
def health():
    """Chỉ để kiểm tra nhanh server đã chạy chưa: http://127.0.0.1:5000/"""
    return jsonify({"status": "ok", "service": "kantei_backend"}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=True)