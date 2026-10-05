import pytest
from scripts.release_notes import generate_release_notes


def test_generate_release_notes():
    issues = [
        {
            "number": 1,
            "title": "Fix bug",
            "html_url": "https://github.com/user/repo/issues/1",
        },
        {
            "number": 2,
            "title": "Add feature",
            "html_url": "https://github.com/user/repo/issues/2",
        },
    ]
    expected = "## Release Notes\n\n- [Fix bug (#1)](https://github.com/user/repo/issues/1)\n- [Add feature (#2)](https://github.com/user/repo/issues/2)"
    assert generate_release_notes(issues) == expected
