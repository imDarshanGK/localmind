# Contributing to localmind
Thank you for your interest in contributing to localmind!  
We welcome contributions of all kinds including bug fixes, feature enhancements, documentation improvements, and testing.

## Contribution Guidelines

Before contributing, please read the following guidelines carefully.


### Before Contributing

- Check existing issues before creating a new one
- Open a discussion for major feature changes
- Keep pull requests focused and minimal
  
### Types of Contributions

You can contribute by:
- Fixing bugs
- Improving documentation
- Adding tutorials or examples
- Improving UI/UX
- Writing tests
- Refactoring code
- Suggesting new features

### Documentation Contributions

Documentation improvements are highly appreciated.
**Examples:**
- Improve setup instructions
- Add screenshots
- Clarify API usage
- Improve onboarding flow
- Fix typos or grammar

### Reporting Issues

When reporting issues, include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Environment details

### Code Style
- Write clean and readable code
- Follow existing project structure
- Add comments where necessary
- Keep functions modular

# How to Contribute

## 1. The Setup Phase (Do this once per project)

### Find and Claim an Issue
1. Look through the [Issues dashboard](https://github.com/imDarshanGK/localmind/issues).
2. Issues labeled `**good first issue**` or `**help wanted**` are ideal for beginners.
3. Comment on the issue to let us know you want to work on it before you start coding/writing.

### Fork the Repository
1. Go to the `<Code>` tab.
2. Click the **Fork** button on the top right corner of the repository page.

### Clone the Repository
If you are working on your local computer instead of the GitHub website, clone your fork using your terminal:

   ```bash

   git clone https://github.com/YOUR-USERNAME/repository-name.git

   cd repository-name

   ```

## 2. The Working Phase (Do this for every single task)

### Create a Clean Branch: 
We use a feature-branch workflow. Please follow this naming convention when creating a new branch:
   * For Docs: docs/short-description
   * For Bugs: bugfix/short-description
   * For Code Features: feat/short-description

**Note**: Never work on main. Create an isolated branch named after your task type.

### Make Your Changes:
Edit the code, fix the typo, or add the new markdown files.

### Test Your Changes:
-  *For Docs:* Use the "Preview" tab on GitHub to make sure your Markdown formatting isn't broken.
- *For Code:* Run the project locally to make sure your changes didn't break existing features.

## 3. The Saving Phase (Commits)
To keep our project history clean and readable, we follow structured commit messages. 

### Commit with a Prefix
Save your work using clear, descriptive commit messages(e.g., "Add feature" instead of "Added feature").
   * docs: fix typo in installation guide
   * fix: resolve crash on user login screen
   * feat: add dark mode toggle button

### Push to GitHub:** 
If you are working locally, push your branch up to your personal fork:

   ```bash

   git push origin name-of-your-branch

   ```

## 4. The Submission Phase (The Pull Request)

### Open a Pull Request (PR)
1. Go to the original repository page. GitHub will show a banner that says **"Compare & pull request"**. 
2. Click it.

### Link the Original Issue
1. In your PR description, always include the magic phrase to auto-close the issue once your work is accepted.
> *"This PR addresses the missing guide. Closes #1"* (Replace #1 with the actual issue number).

 ### Submit and Review
1. Click **Create pull request**.
2. The project owner will review your work, might ask for a few small edits, and will eventually click **Merge**.

## Pull Request Checklist
Before submitting your PR, please ensure you meet the following criteria:
- [ ] My code/documentation follows the style guidelines of this project.
- [ ] I have performed a self-review of my own changes.
- [ ] My commit messages follow the `[type]: description` format.
- [ ] I have linked the relevant issue in the PR description (e.g., `Closes #1`).

## Need Help?
If you have questions or get stuck, feel free to open a discussion or comment directly on the issue you are working on. We are here to help!
Be respectful and constructive in discussions and reviews.

Thank you for contributing!
 
