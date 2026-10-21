"""Send one local, consented image to the running local face API."""

from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main() -> None:
    raw_path = input("Enter or drag the path of a consented JPG/PNG/WebP photo: ").strip()
    path = Path(raw_path.strip("\"' "))
    if not path.is_file():
        print("File not found. Check the path and try again.")
        return
    if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        print("Please choose a JPG, PNG, or WebP file.")
        return

    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    payload = json.dumps({"image_base64": f"data:{mime};base64,{encoded}"}).encode()
    request = Request(
        "http://127.0.0.1:8000/api/recognize",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            result = json.loads(response.read())
    except HTTPError as error:
        print(f"The API returned HTTP {error.code}: {error.read().decode(errors='replace')}")
        return
    except URLError as error:
        print(f"Could not reach the local API: {error.reason}")
        print("Start it first in another Terminal window with: python run.py")
        return

    print(json.dumps(result, indent=2, ensure_ascii=False))
    if result.get("matched"):
        print("Matched. Verify the displayed identity.")
    else:
        print("No identity was accepted. Check the status; indeterminate means the service could not compare reliably.")


if __name__ == "__main__":
    main()
