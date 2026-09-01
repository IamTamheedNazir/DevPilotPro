// DevPilot CLI - GitHub Integration
// Creates repos and pushes generated projects to GitHub

import simpleGit, { SimpleGit } from "simple-git";
import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";
import { GitHubConfig } from "./types.js";

export class GitHubIntegration {
  private octokit: Octokit | null = null;
  private token: string | undefined;

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN;
    if (this.token) {
      this.octokit = new Octokit({ auth: this.token });
    }
  }

  isAuthenticated(): boolean {
    return !!this.octokit;
  }

  async createRepo(
    owner: string,
    repo: string,
    description: string,
    isPrivate: boolean = false
  ): Promise<{ url: string; cloneUrl: string }> {
    if (!this.octokit) {
      throw new Error(
        "GitHub not authenticated. Set GITHUB_TOKEN environment variable or run: devpilot config --github-token <token>"
      );
    }

    try {
      const { data } = await this.octokit.repos.createForAuthenticatedUser({
        name: repo,
        description,
        private: isPrivate,
        auto_init: false,
      });

      return {
        url: data.html_url,
        cloneUrl: data.clone_url,
      };
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err.status === 422) {
        throw new Error(`Repository ${owner}/${repo} already exists`);
      }
      throw new Error(`Failed to create repository: ${err.message}`);
    }
  }

  async pushProject(
    projectPath: string,
    config: GitHubConfig,
    commitMessage: string = "Initial commit from DevPilot"
  ): Promise<{ success: boolean; url: string }> {
    const git: SimpleGit = simpleGit(projectPath);

    // Initialize git if not already
    if (!fs.existsSync(path.join(projectPath, ".git"))) {
      await git.init();
    }

    // Add all files
    await git.add("./*");

    // Create initial commit
    await git.commit(commitMessage);

    // Add remote
    const remoteUrl = `https://github.com/${config.owner}/${config.repo}.git`;
    try {
      await git.removeRemote("origin");
    } catch {
      // Remote doesn't exist yet, that's fine
    }
    await git.addRemote("origin", remoteUrl);

    // Push
    await git.push("origin", config.branch, { "--set-upstream": null } as never);

    return {
      success: true,
      url: `https://github.com/${config.owner}/${config.repo}`,
    };
  }

  async getRepoInfo(owner: string, repo: string): Promise<{
    exists: boolean;
    url?: string;
    cloneUrl?: string;
    defaultBranch?: string;
  }> {
    if (!this.octokit) {
      return { exists: false };
    }

    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      return {
        exists: true,
        url: data.html_url,
        cloneUrl: data.clone_url,
        defaultBranch: data.default_branch,
      };
    } catch {
      return { exists: false };
    }
  }
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Support multiple formats:
  // https://github.com/owner/repo
  // git@github.com:owner/repo.git
  // owner/repo
  const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  const shortMatch = url.match(/^([^/]+)\/([^/]+)$/);

  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}
