/**
 * Fetch commit activity from GitHub API
 */

export async function getCommitActivity(repo: string): Promise<number[]> {
  const token = import.meta.env.GITHUB_TOKEN;

  if (!token) {
    console.warn('GITHUB_TOKEN not set, returning empty activity');
    return [];
  }

  try {
    // Participation stats give us weekly commits for the last year
    const res = await fetch(
      `https://api.github.com/repos/${repo}/stats/participation`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );

    if (!res.ok) {
      // GitHub returns 202 while computing stats - just return empty
      if (res.status === 202) {
        console.log(`Stats computing for ${repo}, will be ready on next build`);
        return [];
      }
      console.warn(`Failed to fetch activity for ${repo}: ${res.status}`);
      return [];
    }

    const data = await res.json();
    // 'all' contains weekly commit counts for all contributors (52 weeks)
    // Take the last 12 weeks for a compact sparkline
    const weeks = data.all?.slice(-12) || [];
    return weeks;
  } catch (err) {
    console.warn(`Error fetching activity for ${repo}:`, err);
    return [];
  }
}

export async function getAllCommitActivity(
  repos: string[],
): Promise<Map<string, number[]>> {
  const results = new Map<string, number[]>();

  // Fetch in parallel but with some throttling to avoid rate limits
  const chunks = [];
  for (let i = 0; i < repos.length; i += 5) {
    chunks.push(repos.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (repo) => {
      const activity = await getCommitActivity(repo);
      results.set(repo, activity);
    });
    await Promise.all(promises);
  }

  return results;
}
