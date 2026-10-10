"""Unit tests for the path guards in extract.py.

The audio path and the episode id both come out of the parquet, so these decide
whether a hostile dataset can write outside --out.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from extract import EXPECTED_EPISODES, safe_audio_name, valid_episode  # noqa: E402


@pytest.mark.parametrize("name", ["001_001.opus", "a-b_c.d.opus"])
def test_plain_filenames_pass_through_unchanged(name):
    assert safe_audio_name(name) == name


@pytest.mark.parametrize("name", [
    "../../../../tmp/pwned.opus",   # traversal
    "/tmp/pwned.opus",              # absolute: os.path.join would discard dest_dir
    "001/002.opus",                 # nested: silently relocates the file
    "001_../../tmp/pwned.opus",     # traversal built from a hostile record id
    "001_002.OPUS",                 # wrong case: the published URLs are lowercase
    "..",
    "",
    "001_001.opus\n",
    "001_001.wav",
    "001_001",
])
def test_anything_that_is_not_a_flat_opus_filename_is_refused(name):
    assert safe_audio_name(name) is None


@pytest.mark.parametrize("ep", [1, 2, EXPECTED_EPISODES])
def test_episodes_inside_the_published_range_are_accepted(ep):
    assert valid_episode(ep)


@pytest.mark.parametrize("ep", [0, -1, EXPECTED_EPISODES + 1, "1", 1.0, None, True])
def test_episode_ids_that_cannot_name_a_directory_are_refused(ep):
    assert not valid_episode(ep)
