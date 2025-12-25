# GitHub Pages Setup for Lemona

This guide explains how to set up GitHub Pages for your Lemona project.

## Quick Setup

1. **Enable GitHub Pages in your repository:**
   - Go to your repository on GitHub
   - Click on **Settings** → **Pages**
   - Under "Source", select **GitHub Actions**
   - Save the settings

2. **Push the workflow file:**
   - The `.github/workflows/deploy.yml` file is already configured
   - Just commit and push it to your repository

3. **Your website will be available at:**
   - `https://[your-username].github.io/Lemona/`
   - Replace `[your-username]` with your GitHub username
   - Replace `Lemona` with your actual repository name (case-sensitive)

## How It Works

- The GitHub Actions workflow automatically builds your frontend when you push to the `main` branch
- It uses the Vite build output from `frontend/dist`
- The site is deployed to GitHub Pages automatically

## Manual Deployment

If you want to deploy manually:

```bash
cd frontend
npm run build
# Then use GitHub CLI or web interface to deploy the dist folder
```

## Custom Domain (Optional)

If you want to use a custom domain:
1. Create a `CNAME` file in `frontend/public/` with your domain name
2. Configure DNS settings for your domain to point to GitHub Pages
3. Update GitHub Pages settings to use your custom domain

