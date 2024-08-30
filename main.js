const axios = require("axios");
require("dotenv").config();

// Jira and Bitbucket configuration
const JIRA_URL = process.env.JIRA_URL;
const JIRA_AUTH = {
  username: process.env.JIRA_USERNAME,
  password: process.env.JIRA_TOKEN,
};
const TEAM_CUSTOM_FIELD = "customfield_10001";

/*
const BITBUCKET_URL = process.env.BITBUCKET_URL;
const BITBUCKET_USERNAME = process.env.BITBUCKET_USERNAME;
const BITBUCKET_APP_PASSWORD = process.env.BITBUCKET_APP_PASS;
const credentials = Buffer.from(
  `${BITBUCKET_USERNAME}:${BITBUCKET_APP_PASSWORD}`
).toString("base64");

function getDateOneMonthAgo() {
  const today = new Date();
  today.setMonth(today.getMonth() - 1);
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, "0");
  const day = today.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}
*/

// Fetch tickets by fixVersion from Jira
async function fetchTicketsByFixVersion(fixVersion) {
  const url = `${JIRA_URL}/rest/api/2/search`;
  const jql = `fixVersion="${fixVersion}"`;

  try {
    const response = await axios.get(url, {
      auth: JIRA_AUTH,
      params: { jql, fields: `key,summary,${TEAM_CUSTOM_FIELD}` },
    });
    const issues = response.data.issues || [];
    return issues
      .map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary,
        team: issue.fields[TEAM_CUSTOM_FIELD]?.name,
      }))
      .slice(0, 3);
  } catch (error) {
    console.error(`Failed to fetch tickets for ${fixVersion}:`, error.message);
    return [];
  }
}

/* 
async function fetchAllRepositories() {
  let repositories = [];
  let url = `${BITBUCKET_URL}/repositories/pecteam/?q=name~"aion-ui-mono"`;

  try {
    while (url) {
      const repoResponse = await axios.get(url, {
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: "application/json",
        },
      });

      repositories = repositories.concat(repoResponse.data.values || []);
      url = repoResponse.data.next || null;
    }

    return repositories;
  } catch (error) {
    console.error(`Failed to fetch repositories:`, error.message);
    return [];
  }
}
*/

async function fetchIssueCommitsInfo(issueKey) {
  const url = `${JIRA_URL}/rest/api/2/issue/${issueKey}`;

  try {
    // Fetch issue details to get the numeric issue ID
    const response = await axios.get(url, {
      auth: JIRA_AUTH,
    });

    const issueNumericId = response.data.id;

    // Fetch development status details for the issue
    const url2 = `${JIRA_URL}/rest/dev-status/latest/issue/detail?issueId=${issueNumericId}&applicationType=bitbucket&dataType=repository`;
    const response2 = await axios.get(url2, {
      auth: JIRA_AUTH,
    });

    // Extract repositories from the response
    const repositories = response2.data.detail[0]?.repositories || [];

    // Map each repository to an object containing its name and commits
    const repoCommitsInfo = repositories.map((repo) => ({
      name: repo.name,
      commits: repo.commits.map((commit) => ({
        id: commit.id,
        message: commit.message,
      })),
    }));

    return repoCommitsInfo;
  } catch (error) {
    console.error(`Failed to fetch issue details: ${error.message}`);
    return [];
  }
}

async function getInfo(fixVersion) {
  console.log(`Fetching tickets for fixVersion: ${fixVersion}...`);

  const tickets = await fetchTicketsByFixVersion(fixVersion);
  const data = {};

  if (tickets.length === 0) {
    console.log(`No tickets found for fixVersion ${fixVersion}.`);
    return;
  }

  // Group tickets by team
  const ticketsByTeam = tickets.reduce((groups, ticket) => {
    const team = ticket.team || "Unknown Team";
    if (!groups[team]) {
      groups[team] = [];
    }
    groups[team].push(ticket);
    return groups;
  }, {});

  // Iterate over teams and their respective tickets
  for (const [team, teamTickets] of Object.entries(ticketsByTeam)) {
    data[team] = []; // Create array to store team tickets

    for (const ticket of teamTickets) {
      const ticketInfo = {
        key: ticket.key,
        summary: ticket.summary,
        repositories: [],
      };

      // Fetch related commits for this ticket across all repositories

      const relatedRepositories = await fetchIssueCommitsInfo(ticket.key);

      if (relatedRepositories.length === 0) {
        ticketInfo.repositories.push({
          repository: "No related commits found",
          commits: [],
        });
      } else {
        relatedRepositories.forEach((repo) => {
          const repoInfo = {
            repository: repo.name,
            commits: repo.commits.map((commit) => ({
              id: commit.id,
              message: commit.message,
            })),
          };
          ticketInfo.repositories.push(repoInfo);
        });
      }

      data[team].push(ticketInfo); // Add ticket info to the team
    }
  }

  return data;
}

function print(data) {
  let output = "";

  for (const [team, tickets] of Object.entries(data)) {
    output += `\nTeam: ${team}\n`;

    tickets.forEach((ticket) => {
      output += `[${ticket.key}] - ${ticket.summary}\n`;

      ticket.repositories.forEach((repo) => {
        output += `  Repository: ${repo.repository}\n`;

        repo.commits.forEach((commit) => {
          output += `    Commit: ${commit.id}\n`;
        });
      });
    });
  }

  console.log(output); // Finally print all at once
}

// Read fixVersion from command line arguments
const fixVersion = process.argv[2];
if (!fixVersion) {
  console.log("Usage: node tool.js <fixVersion>");
  process.exit(1);
}

async function main(fixVersion) {
  const data = await getInfo(fixVersion);
  print(data);
}

main(fixVersion);
