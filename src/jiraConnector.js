const axios = require("axios");
const { truncateString } = require("./helpers");
require("dotenv").config();

const { JIRA_URL, JIRA_USERNAME, JIRA_TOKEN } = process.env;
if (!JIRA_URL || !JIRA_USERNAME || !JIRA_TOKEN) {
  throw new Error("Missing required JIRA environment variables.");
}

const JIRA_AUTH = {
  username: JIRA_USERNAME,
  password: JIRA_TOKEN,
};
const TEAM_CUSTOM_FIELD = "customfield_10001";

// Reusable function for Axios requests with error handling
async function jiraGetRequest(url, params = {}) {
  try {
    const response = await axios.get(url, {
      auth: JIRA_AUTH,
      params,
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Response was received but status code indicates error
      console.error(
        `JIRA API error (Status: ${error.response.status}): ${error.response.data}`
      );
    } else if (error.request) {
      // No response received
      console.error(`No response received from JIRA API: ${error.message}`);
    } else {
      // Other errors
      console.error(`Error in JIRA request: ${error.message}`);
    }
    throw error; // Re-throw error for further handling if necessary
  }
}

// Fetch tickets by FixVersion
async function JIRAFetchTicketsByFixVersion(fixVersion) {
  const url = `${JIRA_URL}/rest/api/2/search`;
  const jql = `fixVersion="${fixVersion}"`;

  try {
    const data = await jiraGetRequest(url, {
      jql,
      fields: `key,summary,${TEAM_CUSTOM_FIELD}`,
    });

    const issues = data.issues || [];
    return issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      team: issue.fields[TEAM_CUSTOM_FIELD]?.name || "No team assigned",
    }));
  } catch (error) {
    console.error(`Failed to fetch tickets for FixVersion: ${fixVersion}.`);
    return [];
  }
}

// Fetch commit info related to a JIRA issue
async function JIRAFetchIssueCommitsInfo(issueKey) {
  const issueUrl = `${JIRA_URL}/rest/api/2/issue/${issueKey}`;

  try {
    // Fetch issue data
    const issueData = await jiraGetRequest(issueUrl);
    const issueNumericId = issueData.id;

    // Fetch commit details
    const issueDetailsUrl = `${JIRA_URL}/rest/dev-status/latest/issue/detail`;
    const issueDetailsParams = {
      issueId: issueNumericId,
      applicationType: "bitbucket",
      dataType: "repository",
    };

    const issueDetailsData = await jiraGetRequest(
      issueDetailsUrl,
      issueDetailsParams
    );

    const repositories = issueDetailsData.detail?.[0]?.repositories || [];
    return repositories.map((repo) => ({
      name: repo.name,
      commits: repo.commits.map((commit) => ({
        id: commit.id,
        message: truncateString(commit.message),
      })),
    }));
  } catch (error) {
    console.error(`Failed to fetch commit info for issue: ${issueKey}.`);
    return [];
  }
}

module.exports = { JIRAFetchTicketsByFixVersion, JIRAFetchIssueCommitsInfo };
