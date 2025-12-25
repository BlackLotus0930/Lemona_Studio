# GitHub Pages Troubleshooting

## 404 Error: "There isn't a GitHub Pages site here"

If you're seeing this error, follow these steps:

### Step 1: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Scroll down to **Pages** (left sidebar)
4. Under **Source**, select **GitHub Actions** (NOT "Deploy from a branch")
5. Click **Save**

### Step 2: Check Your Default Branch Name

The workflow is set to trigger on the `main` branch. If your default branch is different:

**Option A: If your branch is `master`:**
- The workflow will still work, but you can update it if you want

**Option B: If your branch has a different name:**
- Update `.github/workflows/deploy.yml` line 6 to match your branch name

### Step 3: Verify the Workflow File Exists

Make sure `.github/workflows/deploy.yml` is committed and pushed to your repository.

### Step 4: Trigger the Workflow

**Option A: Push a commit to trigger automatically:**
```bash
git add .
git commit -m "Trigger GitHub Pages deployment"
git push
```

**Option B: Run manually:**
1. Go to your repository on GitHub
2. Click **Actions** tab
3. Click **Deploy to GitHub Pages** workflow
4. Click **Run workflow** button (top right)
5. Select your branch and click **Run workflow**

### Step 5: Check Workflow Status

1. Go to **Actions** tab in your repository
2. Look for "Deploy to GitHub Pages" workflow
3. Click on it to see if it's running, succeeded, or failed
4. If it failed, click on the failed job to see error details

### Step 6: Wait for Deployment

- After the workflow completes successfully, wait 1-2 minutes
- GitHub Pages can take a few minutes to update
- Refresh your GitHub Pages URL

### Step 7: Verify the URL

Your GitHub Pages URL should be:
- `https://[your-username].github.io/[repository-name]/`
- Make sure the repository name matches exactly (case-sensitive)

### Common Issues

**Issue: Workflow fails with "npm ci" error**
- Make sure `frontend/package-lock.json` exists
- If not, run `cd frontend && npm install` locally and commit the file

**Issue: Build fails**
- Check the Actions tab for specific error messages
- Make sure all dependencies are listed in `package.json`

**Issue: 404 after successful deployment**
- Clear your browser cache
- Try accessing the URL in an incognito/private window
- Wait a few more minutes for DNS propagation

**Issue: Assets not loading (CSS/JS broken)**
- Check that `VITE_BASE_PATH` in the workflow matches your repository name
- The base path should be `/[repository-name]/` (with trailing slash)

