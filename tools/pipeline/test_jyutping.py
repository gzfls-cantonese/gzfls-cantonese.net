"""Unit tests for the per-character Jyutping generator in extract.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from extract import to_jyutping  # noqa: E402
from pyjyutping.jyutping import convert as jp_convert  # noqa: E402


def _codepoints(text):
    return list(text)


def test_pure_han_aligned_with_tones():
    text = "三國演義"
    result = to_jyutping(text)
    assert len(result) == len(_codepoints(text))
    assert result == ["saam1", "gwok3", "jin2", "ji6"]
    # Every syllable carries a tone digit.
    assert all(s[-1].isdigit() for s in result)


def test_colloquial_cantonese_chars_have_readings():
    text = "喺畀嘅咗冇"
    result = to_jyutping(text)
    assert len(result) == len(_codepoints(text))
    assert all(s != "" for s in result), result


def test_punctuation_digits_spaces_are_blank_placeholders():
    text = "你好，世界！ 123"
    result = to_jyutping(text)
    chars = _codepoints(text)
    assert len(result) == len(chars)
    for ch, jp in zip(chars, result):
        if not ("一" <= ch <= "鿿"):
            # non-Han -> blank placeholder, still occupying its slot
            assert jp == "", f"{ch!r} expected blank, got {jp!r}"
    # the Han characters still got readings
    assert result[0] != "" and result[1] != ""


def test_unknown_han_yields_blank_but_keeps_alignment():
    # 𠮶 is a surrogate-pair code point with no dictionary reading.
    text = "𠮶個"
    result = to_jyutping(text)
    assert len(result) == len(_codepoints(text)) == 2
    assert jp_convert("𠮶") == "𠮶"  # sanity: library echoes it back
    assert result[0] == ""
    assert result[1] != ""  # 個 has a reading


def test_empty_string():
    assert to_jyutping("") == []


def test_length_always_equals_codepoint_count():
    samples = [
        "各位朋友，喺講《三國演義》之前啊。",
        "滾滾長江東逝水，浪花淘盡英雄。",
        "ABCD 1234 ！！",
        "𠮶哋嚟唔嘢",
    ]
    for text in samples:
        result = to_jyutping(text)
        assert len(result) == len(_codepoints(text)), text
        # every non-echoed conversion is a non-empty syllable
        for ch, jp in zip(_codepoints(text), result):
            assert (jp == "") or (jp == jp.strip() and jp != "")
