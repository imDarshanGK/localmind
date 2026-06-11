**🚀 LocalMind: Maintainer Onboarding Guide**



**Welcome to the LocalMind maintainer team! Thank you for helping us build and safeguard a 100% private, offline, local-first AI workspace.**



**This guide contains everything you need to know about your responsibilities, our code review standards, label hygiene, and how to manage the repository effectively.**



**1. 🌟 The Mission of a Maintainer**



**As a maintainer, your priority is to:**



**Preserve Offline Privacy: Ensure no pull requests introduce sneaky network connections, telemetry tracking, or cloud fallbacks.**



**Empower Contributors: Keep your feedback friendly, constructive, and educational. Help contributors learn the Git workflow.**



**Maintain Build Health: Never merge a branch that fails automated CI tests (Python lint, React compiles).**



**2. 📋 Pull Request Review Workflow**



**When a contributor submits a PR, follow this workflow:**



**Step 1: Verify Issue Alignment**



**Ensure the PR states clearly which issue it closes (e.g., Closes #123).**



**Verify that the contributor was actually assigned to that issue before they opened the PR.**



**Step 2: Local Verification \& Security Audit**



**Because LocalMind runs Python code runs via plugins, we must be extremely strict about security:**



**Check for Unsanitized Executions: Look for any use of eval(), exec(), or dangerous subprocess calls in backend routes.**



**No Cloud Telemetry: Inspect any third-party dependencies added to package.json or requirements.txt.**



**Step 3: Git Status Verification**



**Ensure the branch is:**



**Up-to-date with main: If GitHub says "This branch is out-of-date," ask the user to pull the latest changes or click "Update branch".**



**Conflict-Free: Never resolve conflicts directly in the web editor unless they are simple spacing fixes. Ask the contributor to resolve them locally.**



**3. 🏷️ Label \& Milestone Hygiene**



**Keeping issues organized is key to keeping our contributors productive. Use these labels:**



**Difficulty Level Tags**



**level-1 / Easy: Good first issues, simple UI fixes, markdown/docs changes, or basic route adjustments.**



**level-2 / Medium: Requires deeper knowledge of React hooks, state management, or complex backend routing.**



**level-3 / Hard: Core architectural updates, streaming adaptations, custom vector db configurations, or plugin loaders.**



**Hackathon Specifics (SSoC 2026)**



**For Social Summer of Code participants:**



**Ensure the SSoC26 tag is attached to their active issues and PRs.**



**Double-check that correct difficulty labels are present so their automatic leaderboard points compile accurately.**



**4. ⚙️ Running Tests Locally**



**To verify a contributor's backend changes before merging:**



**# Set up a clean virtual environment**

**python3 -m venv venv**

**source venv/bin/activate**

**pip install -r backend/requirements.txt**



**# Run our test suite**

**pytest backend/tests/**





**To verify frontend builds:**



**cd frontend**

**npm install**

**npm run build**





**5. 🤝 Code of Conduct \& Communication**



**Be Welcoming: Remember that many SSoC participants are students writing their very first open-source code.**



**Explain the 'Why': Instead of saying "this is wrong, change it," say "we use custom wrappers here to prevent network leakage—could you try using api.js instead?"**



**Prompt Triaging: Aim to review assigned PRs within 24 to 48 hours to keep momentum high!**



**“The strength of open source lies in its community. Thank you for making LocalMind a better, safer, and faster tool for everyone!”**

