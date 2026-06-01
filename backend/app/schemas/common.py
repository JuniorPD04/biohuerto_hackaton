import re
from typing import Any

CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def clean_text(value: Any) -> Any:
    if isinstance(value, str):
        return CONTROL_CHARS.sub("", value).strip()
    return value

