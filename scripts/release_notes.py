from typing import List, Dict


def generate_release_notes(merged_issues: List[Dict[str, str]]) -> str:
    """Generate markdown release notes from a list of merged issue dictionaries.

    Each dictionary should contain at least the keys ``number`` and ``title``.
    Optionally it may contain ``html_url``; if not provided, a generic GitHub URL
    is constructed using the ``repo`` key (if present).

    The function returns a markdown string where each issue is rendered as a
    bullet point linking to the issue on GitHub.
    """
    lines = ["## Release Notes", ""]
    for issue in merged_issues:
        number = issue.get("number")
        title = issue.get("title", "")
        # Prefer an explicit URL if supplied; otherwise build one.
        url = issue.get("html_url")
        if not url:
            repo = issue.get("repo", "")
            if repo:
                url = f"https://github.com/{repo}/issues/{number}"
            else:
                url = "#"
        lines.append(f"- [{title} (#{number})]({url})")
    return "\n".join(lines)
