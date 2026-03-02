"""カスタム HTTP プロトコル: 非 ASCII バイトを URL エンコードして処理する。

Uvicorn のデフォルト HTTP パーサー（h11 / httptools）は RFC 7230 に準拠し、
URL 中の非 ASCII バイトを拒否して 400 を返す。
日本語のみのアプリケーションでは、curl 等のクライアントから生の UTF-8 バイトが
送信されるケースがあるため、リクエストラインの非 ASCII バイトを
パーセントエンコードしてからパーサーに渡す。

Usage (Dockerfile / uvicorn CLI):
    uvicorn app.main:app --http app.core.http_protocol
"""

from __future__ import annotations

from uvicorn.protocols.http.httptools_impl import HttpToolsProtocol


def _encode_non_ascii_in_request_line(data: bytes) -> bytes:
    """リクエストラインに含まれる非 ASCII バイトをパーセントエンコードする。

    HTTP/1.1 のリクエストラインは ``METHOD SP URL SP HTTP/X.Y CRLF`` の形式。
    URL 部分のみを対象にエンコードを行い、ヘッダー部分はそのまま返す。
    """
    # リクエストラインの終端 (CRLF) を探す
    crlf_pos = data.find(b"\r\n")
    if crlf_pos == -1:
        # 完全なリクエストラインが含まれない → そのまま返す
        return data

    request_line = data[:crlf_pos]
    rest = data[crlf_pos:]

    # 非 ASCII バイトが含まれない場合は早期リターン
    if all(b < 128 for b in request_line):
        return data

    # METHOD SP URL SP HTTP/X.Y をパース
    parts = request_line.split(b" ", 2)
    if len(parts) != 3:
        return data

    method, url, version = parts

    # URL 中の非 ASCII バイトだけをパーセントエンコード
    encoded_parts: list[bytes] = []
    for byte in url:
        if byte > 127:
            encoded_parts.append(f"%{byte:02X}".encode("ascii"))
        else:
            encoded_parts.append(bytes([byte]))
    encoded_url = b"".join(encoded_parts)

    return method + b" " + encoded_url + b" " + version + rest


class HttpToolsProtocolWithUTF8(HttpToolsProtocol):
    """非 ASCII URL を自動エンコードする HttpToolsProtocol サブクラス。"""

    def data_received(self, data: bytes) -> None:
        """受信データ内の非 ASCII バイトをエンコードしてから親に渡す。"""
        super().data_received(_encode_non_ascii_in_request_line(data))
