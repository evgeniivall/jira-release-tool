// Unused code for future
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

async function fetchAllRepositories() {
  let repositories = [];
  let url = `${BITBUCKET_URL}/repositories/"`;

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
