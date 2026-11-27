"""NDLOCR-Lite の文字起こし結果から名刺の項目を切り出す（LLM 不使用）。

方針:
- 画像に写っている文字だけを使う。住所や氏名を推測で補完しない。
- 判別できない項目は None / 空にする。
- 判別できなかった行は memo に残し、人が確認・修正できるようにする。

出力は ``app.services.ocr.empty_result()`` と同じ形（キーを揃える）。
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

# 会社名の末尾・先頭に付く法人格（長いものを先に照合する）
COMPANY_SUFFIXES: tuple[str, ...] = (
    "国立大学法人",
    "独立行政法人",
    "社会福祉法人",
    "一般社団法人",
    "一般財団法人",
    "公益社団法人",
    "公益財団法人",
    "特定非営利活動法人",
    "医療法人",
    "学校法人",
    "宗教法人",
    "協同組合",
    "合同会社",
    "合資会社",
    "合名会社",
    "有限会社",
    "株式会社",
    "(株)",
    "(有)",
    "(同)",
)

# 法人格が無くても会社名と判断できる語
COMPANY_KEYWORDS: tuple[str, ...] = (
    "会社",
    "工業",
    "商事",
    "物産",
    "製作所",
    "製作",
    "研究所",
    "事務所",
    "銀行",
    "信託",
    "証券",
    "保険",
    "病院",
    "大学",
    "学校",
    "ホールディングス",
    "グループ",
    "カンパニー",
    "コーポレーション",
    "システムズ",
    "ソリューションズ",
    "テクノロジー",
    "エンタープライズ",
    "ファーム",
)

# 役職（長いものを先に照合する）
POSITIONS: tuple[str, ...] = (
    "代表取締役会長",
    "代表取締役社長",
    "代表取締役",
    "取締役会長",
    "取締役副社長",
    "副社長",
    "専務取締役",
    "常務取締役",
    "執行役員",
    "監査役",
    "相談役",
    "取締役",
    "事業部長",
    "本部長",
    "部長",
    "次長",
    "課長",
    "室長",
    "係長",
    "主任",
    "支店長",
    "工場長",
    "所長",
    "店長",
    "会長",
    "社長",
    "専務",
    "常務",
    "顧問",
    "参与",
    "理事",
    "代表",
    "リーダー",
    "チーフ",
    "マネージャー",
    "マネジャー",
    "ディレクター",
    "プロデューサー",
    "エンジニア",
    "デザイナー",
    "コンサルタント",
    "アドバイザー",
    "アナリスト",
    "担当",
    "アシスタント",
)

# 部署名の末尾
DEPARTMENT_SUFFIXES: tuple[str, ...] = (
    "本部",
    "事業部",
    "統括部",
    "事業所",
    "営業所",
    "支社",
    "支店",
    "部",
    "課",
    "室",
    "グループ",
    "チーム",
    "ユニット",
    "センター",
)

# 役職が「部」「課」「室」で始まる場合、直前の語と連結して部署名になる
DEPT_LEAD_CHARS = ("部", "課", "室")

_PREFECTURE_TEXT = (
    "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 "
    "埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 "
    "岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 "
    "鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 "
    "佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県"
)
_PREFECTURES = _PREFECTURE_TEXT.split()

# 姓の判定用（命名規則の補助。ここに無ければ経験則で分割する）
_SURNAME_TEXT = """
    佐藤 鈴木 高橋 田中 伊藤 渡辺 山本 中村 小林 加藤 吉田 山田 佐々木 山口
    松本 井上 木村 林 斎藤 清水 山崎 森 池田 橋本 阿部 石川 山下 中島 石井
    小川 前田 岡田 長谷川 藤田 後藤 近藤 村上 遠藤 青木 坂本 斉藤 福田 太田
    西村 藤井 金子 岡本 藤原 中野 三浦 原田 松田 中川 中尾 石田 上田 森田
    柴田 酒井 工藤 横山 宮崎 宮本 内田 高木 安藤 谷口 大野 丸山 今井 河野
    藤本 村田 武田 上野 杉山 増田 小野 田村 中山 和田 石原 中田 市川 小島
    平野 平田 野村 菊地 菊池 西田 松井 岩崎 千葉 菅原 木下 久保 佐野 野口
    松尾 小池 高野 大塚 服部 福井 岩田 小泉 大西 北村 松岡 小松 加納 荒木
    西川 大石 浜田 吉川 村松 久保田 三宅 大森 北川 河合 黒田 長田 梅田 野田
    西野 杉本 内藤 水野 吉岡 高田 竹内 長尾 大谷 松村 田口 早川 飯田 西本
    川口 大川 土屋 奥村 秋山 小沢 小澤 長島 長野 安田 熊谷 畠山 新井 森本
    松永 片山 岡崎 小原 浅野 桜井 大久保 安部 高井 篠原 高松 宮下 大槻 平山
    川崎 野中 堀内 辻 西尾 岡 小坂 関 宮田 小出 石橋 大島 川上 北野 南
    東 西 小西 大前 岩本 古川 河村 神田 浅井 内山 片岡 高梨 小森 矢野 森下
    出口 飯塚 浦田 江口 大木 小野寺 粕谷 木戸 日高 二宮 三谷 村井 矢島 湯浅
    若林 渡部 青柳 赤松 秋元 阿久津 安達 有田 飯島 池上 石垣 泉 井口 岩井
    上原 植田 臼井 内海 江藤 大江 岡部 小田 加賀 片桐 勝又 金井 亀井 川端
    神谷 木村 清野 工藤 久野 窪田 熊田 倉田 小池 小柳 紺野 斉木 坂口 佐久間
    桜田 佐竹 佐伯 沢田 篠田 柴崎 島田 下田 白井 神野 杉浦 鈴村 関口 瀬川
    高瀬 滝沢 竹田 田辺 谷川 田原 千田 塚本 土井 戸田 富田 中里 中沢 永井
    永田 夏目 成田 新田 西沢 二階堂 丹羽 野沢 橋爪 長谷 服部 花田 林田 原
    樋口 久米 日野 平井 広瀬 深田 福島 藤川 船越 古賀 古田 細川 堀田 本間
    前川 牧野 増井 松原 水谷 溝口 三上 光田 南雲 宮川 村岡 室井 森川 八木
    安井 柳田 山岸 山内 山村 横田 吉野 米田 若松 和田 渡邊
"""
SURNAMES: frozenset[str] = frozenset(_SURNAME_TEXT.split())

# 異体字・旧字体を照合用に正規化する（表示は元の文字のまま）
_VARIANT_MAP = str.maketrans(
    {
        "髙": "高",
        "﨑": "崎",
        "邊": "辺",
        "邉": "辺",
        "澤": "沢",
        "濱": "浜",
        "齋": "斎",
        "齊": "斉",
        "櫻": "桜",
        "樂": "楽",
        "廣": "広",
    }
)

_SURNAME_LOOKUP = frozenset(name.translate(_VARIANT_MAP) for name in SURNAMES)

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_URL_RE = re.compile(r"(?:https?://)?(?:www\.)?([A-Za-z0-9\-]+\.)+[A-Za-z]{2,}(?:/[^\s]*)?")
_PHONE_RE = re.compile(r"(?:\+81|0)\d{1,4}-\d{1,4}-\d{3,4}")
_POSTAL_RE = re.compile(r"\d{3}-\d{4}")
_LATIN_RE = re.compile(r"[A-Za-z][A-Za-z .'\-]+")
_NAME_CHARS_RE = re.compile(r"^[一-龥々〆ヵヶぁ-んァ-ヴー・]+(?: [一-龥々〆ヵヶぁ-んァ-ヴー・]+)*$")
_KANA_RE = re.compile(r"^[ァ-ヴー・\s]+$")
_DIGIT_RE = re.compile(r"\d")
_PHONE_CHARS_RE = re.compile(r"^[\d\-+()（）\s]+$")

# 連絡先の優先順位（先頭が is_primary になる）
_CONTACT_PRIORITY = {
    "email": 0,
    "mobile": 1,
    "tel": 2,
    "website": 3,
    "x": 4,
    "instagram": 5,
    "youtube": 6,
    "github": 7,
    "linkedin": 8,
    "facebook": 9,
    "tiktok": 10,
    "booth": 11,
    "discord": 12,
    "line": 13,
    "fax": 14,
    "address": 15,
    "other": 16,
}

_TEL_LABELS = ("TEL", "Tel", "tel", "電話", "PHONE", "Phone", "phone", "T:")
_FAX_LABELS = ("FAX", "Fax", "fax", "ファックス", "F:")
_MOBILE_LABELS = ("Mobile", "MOBILE", "mobile", "携帯", "携帯電話", "Cell", "CELL", "M:")
_MAIL_LABELS = ("E-mail", "Email", "EMAIL", "Mail", "mail", "メール", "e-mail")
_URL_LABELS = ("URL", "Url", "url", "HP", "Web", "WEB", "Website", "ホームページ")
_ADDRESS_LABELS = ("住所", "所在地", "Address", "ADDRESS", "Add:")

_SOCIAL_HOSTS = (
    ("x.com", "x"),
    ("twitter.com", "x"),
    ("instagram.com", "instagram"),
    ("youtube.com", "youtube"),
    ("youtu.be", "youtube"),
    ("github.com", "github"),
    ("linkedin.com", "linkedin"),
    ("facebook.com", "facebook"),
    ("fb.me", "facebook"),
    ("tiktok.com", "tiktok"),
    ("booth.pm", "booth"),
    ("discord.gg", "discord"),
    ("discord.com", "discord"),
    ("line.me", "line"),
    ("lin.ee", "line"),
)


def _normalize(text: str) -> str:
    """全角英数字・記号を揃え、余分な空白を落とす。"""
    value = unicodedata.normalize("NFKC", text or "")
    value = value.replace("\u3000", " ").replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip(" ・|/-")


def _strip_label(line: str, labels: tuple[str, ...]) -> str:
    for label in labels:
        if line.startswith(label):
            rest = line[len(label) :].lstrip(" :：.-")
            return rest.strip()
    return ""


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value)


def _phone_value(value: str) -> str | None:
    """電話番号らしい部分を返す（無ければ None）。

    行全体が数字・ハイフン・括弧・空白だけなら、それをそのまま使う。
    ラベルが崩れて余計な文字が付いている場合は、ハイフン区切りの
    電話番号パターンを拾う。どちらも 10〜11 桁のときだけ返す。
    """
    if _PHONE_CHARS_RE.match(value) and 10 <= len(_digits(value)) <= 11:
        return value.strip()
    match = _PHONE_RE.search(value)
    if match and 10 <= len(_digits(match.group(0))) <= 11:
        return match.group(0)
    return None


def _looks_like_address(line: str) -> bool:
    if "〒" in line or _POSTAL_RE.search(line):
        return True
    if any(pref in line for pref in _PREFECTURES):
        return True
    if re.search(r"[市区町村郡]", line) and re.search(r"\d", line):
        return True
    return bool(re.search(r"(丁目|番地|番|号|ビル|階|F)\s*$", line))


def _split_company_and_rest(line: str) -> tuple[str | None, str]:
    """1 行から会社名を切り出す。残りは部署・役職の判定に回す。"""
    for suffix in COMPANY_SUFFIXES:
        index = line.find(suffix)
        if index < 0:
            continue
        end = index + len(suffix)
        # 「株式会社サンプルテック」のように法人格が先頭に来る形
        if index == 0:
            # 法人格の後ろに会社名、その後に部署・役職が続く場合は区切る
            rest = line[end:]
            cut = _first_department_index(rest)
            if cut > 0:
                return line[: end + cut].strip(), rest[cut:].strip()
            return line.strip(), ""
        # 「サンプルテック株式会社」のように末尾に来る形
        tail = line[end:].strip()
        if tail:
            return line[:end].strip(), tail
        return line.strip(), ""
    return None, line


_DEPT_TOKEN_RE = re.compile(
    r"[^\s]{1,12}?(?:" + "|".join(DEPARTMENT_SUFFIXES) + r")"
)


def _first_department_index(text: str) -> int:
    """部署名が始まる位置を返す（無ければ -1）。

    会社名の後ろに「営業本部」のような語が続く場合に、
    語の途中で切らないよう部署名の先頭を探す。
    """
    match = _DEPT_TOKEN_RE.search(text)
    if match and match.start() > 0:
        return match.start()
    return -1


def _split_department_position(line: str) -> tuple[str | None, str | None, str]:
    """「営業部 課長」のような行を部署・役職・残りに分ける。"""
    for position in POSITIONS:
        if not line.endswith(position):
            continue
        prefix = line[: -len(position)].strip()
        # 「取締役部長」のように役職が連結している場合
        if prefix and prefix in POSITIONS:
            return None, prefix + position, ""
        department: str | None = None
        # 「営業部 課長」のように部署名がそのまま残っている場合
        if prefix and _is_department(prefix):
            department, prefix = prefix, ""
        # 「営業部長」「営業課長」のように 部/課/室 を共有する場合
        elif (
            prefix
            and position[0] in DEPT_LEAD_CHARS
            and not prefix.endswith(position[0])
        ):
            candidate = prefix + position[0]
            if _is_department(candidate):
                department, prefix = candidate, ""
        if prefix:
            return department, position, prefix
        return department, position, ""
    if _is_department(line):
        return line, None, ""
    return None, None, line


def _is_department(text: str) -> bool:
    return any(text.endswith(suffix) for suffix in DEPARTMENT_SUFFIXES) and len(text) <= 20


def _split_person_name(line: str) -> tuple[str, str] | None:
    """氏名の行を姓・名に分ける。分けられなければ None。

    異体字は照合のためだけに正規化し、返す文字列は元の文字のまま。
    """
    text = line.translate(_VARIANT_MAP)
    tokens = text.split()
    original_tokens = line.split()

    if len(tokens) == 2 and all(1 <= len(token) <= 4 for token in tokens):
        return original_tokens[0], original_tokens[1]

    joined = "".join(tokens)
    original = "".join(original_tokens)
    if not (2 <= len(joined) <= 6):
        return None
    if joined in _SURNAME_LOOKUP:
        # 姓だけが書かれている（given name が無い）
        return original, ""
    for length in (3, 2, 1):
        if len(joined) - length < 1:
            continue
        if joined[:length] in _SURNAME_LOOKUP:
            return original[:length], original[length:]
    # 辞書に無い場合の経験則（姓 2 文字が最も多い）
    if len(joined) == 3:
        return original[:2], original[2:]
    if len(joined) == 4:
        return original[:2], original[2:]
    if len(joined) == 2:
        return original[0], original[1]
    if len(joined) == 5:
        return original[:2], original[2:]
    return None


def _social_type(host: str) -> str | None:
    for domain, ctype in _SOCIAL_HOSTS:
        if host.endswith(domain):
            return ctype
    return None


def _add_contact(
    contacts: list[dict[str, Any]], seen: set[str], ctype: str, value: str
) -> None:
    value = value.strip(" .,;")
    if not value or value in seen:
        return
    seen.add(value)
    contacts.append({"type": ctype, "value": value, "is_primary": False})


def parse_card_text(
    lines: list[str], raw_text: str | None = None
) -> dict[str, Any]:
    """OCR の行（読み順）から名刺の項目を作る。

    :param lines: NDLOCR-Lite が返した行テキスト（読み順）
    :param raw_text: 行が空のときのフォールバック（全文）
    """
    cleaned = [_normalize(line) for line in lines]
    cleaned = [line for line in cleaned if line]
    if not cleaned and raw_text:
        cleaned = [_normalize(line) for line in raw_text.splitlines()]
        cleaned = [line for line in cleaned if line]

    contacts: list[dict[str, Any]] = []
    seen_contacts: set[str] = set()

    company: str | None = None
    department: str | None = None
    position: str | None = None
    last_name = ""
    first_name = ""
    last_name_kana: str | None = None
    first_name_kana: str | None = None
    name_found = False

    name_candidates: list[str] = []
    chosen: str | None = None
    kana_candidates: list[str] = []
    leftovers: list[str] = []
    address_seen = False

    for line in cleaned:
        # --- 連絡先（ラベル付き） ---
        value = _strip_label(line, _MAIL_LABELS)
        if value and "@" in value:
            email_match = _EMAIL_RE.search(value)
            _add_contact(
                contacts,
                seen_contacts,
                "email",
                email_match.group(0) if email_match else value,
            )
            continue

        value = _strip_label(line, _FAX_LABELS)
        phone = _phone_value(value)
        if phone:
            _add_contact(contacts, seen_contacts, "fax", phone)
            continue

        value = _strip_label(line, _MOBILE_LABELS)
        phone = _phone_value(value)
        if phone:
            _add_contact(contacts, seen_contacts, "mobile", phone)
            continue

        value = _strip_label(line, _TEL_LABELS)
        phone = _phone_value(value)
        if phone:
            _add_contact(contacts, seen_contacts, "tel", phone)
            continue

        value = _strip_label(line, _URL_LABELS)
        if value and _URL_RE.search(value) and not _EMAIL_RE.search(value):
            url_match = _URL_RE.search(value)
            url = url_match.group(0) if url_match else value
            host_match = re.search(r"([A-Za-z0-9\-]+\.)+[A-Za-z]{2,}", url)
            host = host_match.group(0).lower() if host_match else ""
            _add_contact(
                contacts, seen_contacts, _social_type(host) or "website", url
            )
            continue

        # --- ラベル無しの連絡先 ---
        email_match = _EMAIL_RE.search(line)
        if email_match:
            _add_contact(contacts, seen_contacts, "email", email_match.group(0))
            continue

        phone = _phone_value(line)
        if phone:
            digits = _digits(phone)
            ctype = "mobile" if digits.startswith(("070", "080", "090")) else "tel"
            _add_contact(contacts, seen_contacts, ctype, phone)
            continue

        if "://" in line or re.search(r"(www\.|[A-Za-z0-9\-]+\.(jp|com|net|org|io|dev|me|co))", line):
            url_match = _URL_RE.search(line)
            if url_match:
                url = url_match.group(0)
                host_match = re.search(r"([A-Za-z0-9\-]+\.)+[A-Za-z]{2,}", url)
                host = host_match.group(0).lower() if host_match else ""
                _add_contact(
                    contacts, seen_contacts, _social_type(host) or "website", url
                )
                continue

        # --- 住所 ---
        if _looks_like_address(line):
            address = line.lstrip("〒 ").strip()
            if not address_seen:
                _add_contact(contacts, seen_contacts, "address", address)
                address_seen = True
            else:
                # 住所が 2 行に折り返されている場合は前の行に連結する
                for contact in reversed(contacts):
                    if contact["type"] == "address":
                        contact["value"] = f"{contact['value']} {address}".strip()
                        break
            continue

        # --- 会社名 ---
        if company is None:
            found, rest = _split_company_and_rest(line)
            if found:
                company = found
                if rest:
                    dept, pos, remains = _split_department_position(rest)
                    department = department or dept
                    position = position or pos
                    if remains:
                        leftovers.append(remains)
                continue

        if (
            company is None
            and any(word in line for word in COMPANY_KEYWORDS)
            and len(line) <= 30
        ):
            company = line
            continue

        # --- 部署・役職 ---
        dept, pos, remains = _split_department_position(line)
        if pos and position is None:
            position = pos
            department = department or dept
            if remains:
                leftovers.append(remains)
            continue
        if dept and department is None and not _DIGIT_RE.search(line):
            department = dept
            continue

        # --- 氏名・フリガナの候補 ---
        if _KANA_RE.match(line):
            kana_candidates.append(line)
            continue
        if (
            _NAME_CHARS_RE.match(line)
            and not _DIGIT_RE.search(line)
            and not any(word in line for word in COMPANY_KEYWORDS)
        ):
            name_candidates.append(line)
            continue

        leftovers.append(line)

    # --- 氏名の決定 ---
    # 候補のうち最も「氏名らしい」行を選ぶ（2 トークン、または 2〜5 文字）
    def name_score(candidate: str) -> tuple[int, int]:
        tokens = candidate.split()
        if len(tokens) == 2:
            return (0, sum(len(token) for token in tokens))
        return (1, abs(len("".join(tokens)) - 3))

    if name_candidates:
        chosen = sorted(name_candidates, key=name_score)[0]
        split = _split_person_name(chosen)
        if split is not None:
            last_name, first_name = split
            name_found = True

    for candidate in name_candidates:
        if not name_found or candidate != chosen:
            leftovers.append(candidate)

    # --- フリガナの決定（姓名が 2 トークンで分かれている場合のみ） ---
    if name_found:
        for kana in kana_candidates:
            tokens = kana.split()
            if len(tokens) == 2 and all(1 <= len(token) <= 6 for token in tokens):
                last_name_kana, first_name_kana = tokens[0], tokens[1]
                kana_candidates.remove(kana)
                break

    leftovers.extend(kana_candidates)

    # --- 連絡先の並べ替え（email を先頭＝primary にする） ---
    contacts.sort(key=lambda item: _CONTACT_PRIORITY.get(item["type"], 16))
    if contacts:
        contacts[0]["is_primary"] = True

    memo = "\n".join(leftovers) if leftovers else None

    return {
        "first_name": first_name,
        "last_name": last_name,
        "first_name_kana": first_name_kana,
        "last_name_kana": last_name_kana,
        "company_name": company,
        "department": department,
        "position": position,
        "memo": memo,
        "contact_methods": contacts,
    }
