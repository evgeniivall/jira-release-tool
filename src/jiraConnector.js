const axios = require("axios");
const { truncateString } = require("./helpers");
require("dotenv").config();

const JIRA_URL = process.env.JIRA_URL;
const JIRA_AUTH = {
  username: process.env.JIRA_USERNAME,
  password: process.env.JIRA_TOKEN,
};
const TEAM_CUSTOM_FIELD = "customfield_10001";

async function JIRAFetchTicketsByFixVersion(fixVersion) {
  const url = `${JIRA_URL}/rest/api/2/search`;
  const jql = `fixVersion="${fixVersion}"`;

  try {
    const response = await axios.get(url, {
      auth: JIRA_AUTH,
      params: { jql, fields: `key,summary,${TEAM_CUSTOM_FIELD}` },
    });
    const issues = response.data.issues || [];
    return issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      team: issue.fields[TEAM_CUSTOM_FIELD]?.name,
    }));
  } catch (error) {
    console.error(`Failed to fetch tickets for ${fixVersion}:`, error.message);
    return [];
  }
}

async function JIRAFetchIssueCommitsInfo(issueKey) {
  const url1 = `${JIRA_URL}/rest/api/2/issue/${issueKey}`;

  try {
    const response = await axios.get(url1, {
      auth: JIRA_AUTH,
    });

    const issueNumericId = response.data.id;
    const url2 = `${JIRA_URL}/rest/dev-status/latest/issue/detail?issueId=${issueNumericId}&applicationType=bitbucket&dataType=repository`;
    const response2 = await axios.get(url2, {
      auth: JIRA_AUTH,
    });

    const repositories = response2.data.detail[0]?.repositories || [];
    const repoCommitsInfo = repositories.map((repo) => ({
      name: repo.name,
      commits: repo.commits.map((commit) => ({
        id: commit.id,
        message: truncateString(commit.message),
      })),
    }));

    return repoCommitsInfo;
  } catch (error) {
    console.error(`Failed to fetch issue details: ${error.message}`);
    return [];
  }
}

module.exports = { JIRAFetchTicketsByFixVersion, JIRAFetchIssueCommitsInfo };
