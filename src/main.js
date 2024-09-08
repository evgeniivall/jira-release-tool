const axios = require("axios");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const {
  JIRAFetchTicketsByFixVersion,
  JIRAFetchIssueCommitsInfo,
} = require("./jiraConnector");

require("dotenv").config();

const INDENTION = "    ";

// Fetch related commits for a ticket
async function fetchRelatedCommits(ticket) {
  const ticketInfo = {
    key: ticket.key,
    summary: ticket.summary,
    repositories: {},
  };

  try {
    const relatedRepositories = await JIRAFetchIssueCommitsInfo(ticket.key);
    relatedRepositories.forEach((repo) => {
      const repoInfo = {
        commits: repo.commits.map((commit) => ({
          id: commit.id,
          message: commit.message,
        })),
      };
      ticketInfo.repositories[repo.name] = repoInfo;
    });
  } catch (error) {
    console.error(
      `Error fetching commits for ticket ${ticket.key}: ${error.message}`
    );
  }

  return ticketInfo;
}

// Fetch and group tickets by team
async function getInfo(fixVersion) {
  console.log(`Fetching tickets for fixVersion: ${fixVersion}...`);

  try {
    const tickets = await JIRAFetchTicketsByFixVersion(fixVersion);
    if (!tickets.length) {
      console.log(`No tickets found for fixVersion ${fixVersion}.`);
      return null;
    }

    // Group tickets by team
    const ticketsByTeam = tickets.reduce((groups, ticket) => {
      const team = ticket.team || "Unknown Team";
      if (!groups[team]) groups[team] = [];
      groups[team].push(ticket);
      return groups;
    }, {});

    const data = {};
    for (const [team, teamTickets] of Object.entries(ticketsByTeam)) {
      const ticketPromises = teamTickets.map((ticket) =>
        fetchRelatedCommits(ticket)
      );
      data[team] = await Promise.all(ticketPromises);
    }

    return data;
  } catch (error) {
    console.error(
      `Failed to fetch tickets for fixVersion ${fixVersion}: ${error.message}`
    );
    return null;
  }
}

// Format repositories and commits for display
function formatRepositories(repositories, showCommits) {
  let output = "";
  const repos = Object.entries(repositories);
  if (!repos.length) return "No related commits found.\n";

  repos.forEach(([repo, { commits }]) => {
    output += `${INDENTION}${showCommits ? "Repository: " : ""}${repo}\n`;
    if (showCommits) {
      commits.forEach((commit) => {
        output += `${INDENTION}${INDENTION}[${commit.id}] ${commit.message}\n`;
      });
    }
  });

  return output;
}

// Format the output based on the report type and options
function formatOutput(data, reportType, showStories) {
  if (!data) return "No data to display.\n";

  let output = "";
  const mergedRepositories = {};

  for (const [team, tickets] of Object.entries(data)) {
    output += `\nTeam: ${team}\n`;

    tickets.forEach((ticket) => {
      if (!showStories) {
        // Merge repositories if not showing stories
        Object.entries(ticket.repositories).forEach(([repo, { commits }]) => {
          if (!mergedRepositories[repo]) {
            mergedRepositories[repo] = { commits: [] };
          }
          mergedRepositories[repo].commits.push(...commits);
        });
      } else {
        // Show each ticket's details
        output += `[${ticket.key}] - ${ticket.summary}\n`;
        output += formatRepositories(
          ticket.repositories,
          reportType === "commits"
        );
      }
    });

    if (!showStories) {
      // Show merged repositories if stories are not shown
      output += formatRepositories(
        mergedRepositories,
        reportType === "commits"
      );
    }
  }

  return output;
}

// Print the output either to console or file
function printOutput(output, outputFile) {
  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, output);
      console.log(`Output written to ${outputFile}`);
    } catch (error) {
      console.error(`Failed to write to file ${outputFile}: ${error.message}`);
    }
  } else {
    console.log(output);
  }
}

// Parse command-line arguments
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

// Main function to run the process
async function main() {
  const { fixVersion, outputFile, reportType, showStories } = argv;

  try {
    const data = await getInfo(fixVersion);
    if (data) {
      const formattedOutput = formatOutput(data, reportType, showStories);
      printOutput(formattedOutput, outputFile);
    }
  } catch (error) {
    console.error(`Error processing the request: ${error.message}`);
  }
}

main();
