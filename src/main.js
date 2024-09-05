const axios = require("axios");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { truncateString } = require("./helpers");
require("dotenv").config();

// Jira configuration
const JIRA_URL = process.env.JIRA_URL;
const JIRA_AUTH = {
  username: process.env.JIRA_USERNAME,
  password: process.env.JIRA_TOKEN,
};
const TEAM_CUSTOM_FIELD = "customfield_10001";
const INDENTION = "    ";

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
        message: truncateString(commit.message),
      })),
    }));

    return repoCommitsInfo;
  } catch (error) {
    console.error(`Failed to fetch issue details: ${error.message}`);
    return [];
  }
}

async function fetchRelatedCommits(ticket) {
  const ticketInfo = {
    key: ticket.key,
    summary: ticket.summary,
    repositories: [],
  };

  const relatedRepositories = await fetchIssueCommitsInfo(ticket.key);

  if (relatedRepositories.length !== 0) {
    relatedRepositories.forEach((repo) => {
      const repoInfo = {
        commits: repo.commits.map((commit) => ({
          id: commit.id,
          message: commit.message,
        })),
      };
      ticketInfo.repositories[repo.name] = repoInfo;
    });
  }

  return ticketInfo;
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

    // Fetch related commits for all tickets in parallel
    const ticketPromises = teamTickets.map((ticket) =>
      fetchRelatedCommits(ticket)
    );

    // Wait for all promises to resolve
    data[team] = await Promise.all(ticketPromises);
  }

  return data;
}

function formatRepositories(repositories, showCommits) {
  let output = "";
  const repos = Object.entries(repositories);
  if (!repos.length) return "No related commits found.\n";

  repos.map(([repo, { commits }]) => {
    output += `${INDENTION}${showCommits ? "Repository: " : ""}${repo}\n`;
    if (showCommits) {
      commits.forEach((commit) => {
        output += `${INDENTION}${INDENTION}[${commit.id}] ${commit.message}\n`;
      });
    }
  });

  return output;
}

function formatOutput(data, reportType, showStories) {
  let output = "";
  const mergedRepositories = {};

  if (!showStories) {
  }

  for (const [team, tickets] of Object.entries(data)) {
    output += `\nTeam: ${team}\n`;

    tickets.forEach((ticket) => {
      if (!showStories) {
        Object.entries(ticket.repositories).map(([repo, { commits }]) => {
          if (!mergedRepositories[repo]) {
            mergedRepositories[repo] = { commits: [] };
          }
          mergedRepositories[repo].commits.push(...commits);
        });
      } else {
        output += `[${ticket.key}] - ${ticket.summary}\n`;
        output += formatRepositories(
          ticket.repositories,
          reportType === "commits"
        );
      }
    });

    if (!showStories) {
      output += formatRepositories(
        mergedRepositories,
        reportType === "commits"
      );
    }
  }

  return output;
}

function printOutput(output, outputFile) {
  if (outputFile) {
    fs.writeFileSync(outputFile, output);
    console.log(`Output written to ${outputFile}`);
  } else {
    console.log(output);
  }
}

const argv = yargs(hideBin(process.argv))
  .option("fixVersion", {
    alias: "f",
    describe: "The fixVersion to search for in Jira",
    type: "string",
    demandOption: true,
  })
  .option("output-file", {
    alias: "o",
    describe: "The file to write the output to",
    type: "string",
  })
  .option("report-type", {
    alias: "r",
    describe: 'Report type: "repositories" or "commits"',
    type: "string",
    choices: ["repositories", "commits"],
    default: "repositories",
  })
  .option("show-stories", {
    alias: "s",
    describe: "Group commits/repositories by user story",
    type: "boolean",
    default: false,
  })
  .help()
  .alias("help", "h").argv;

async function main() {
  const { fixVersion, outputFile, reportType, showStories } = argv;
  const data = await getInfo(fixVersion);
  const formattedOutput = formatOutput(data, reportType, showStories);
  printOutput(formattedOutput, outputFile);
}

main();
