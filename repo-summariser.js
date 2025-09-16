// repo-summariser.js
const fs = require('fs');
const csv = require('csv-parser')
const { CodeCommitClient, ListRepositoriesCommand, GetFileCommand } = require("@aws-sdk/client-codecommit");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createObjectCsvWriter } = require('csv-writer');
require('dotenv').config();

const AWS_REGION = "eu-west-2";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OUTPUT_CSV_FILE = 'repositories_summary.csv';

// --- INITIALIZE CLIENTS ---

const codecommitClient = new CodeCommitClient({ region: AWS_REGION });

if (!GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is not set. Please create a .env file and add the correct variable.");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

const fileExists = fs.existsSync(OUTPUT_CSV_FILE);
const csvWriter = createObjectCsvWriter({
    path: OUTPUT_CSV_FILE,
    header: [
        { id: 'name', title: 'RepositoryName' },
        { id: 'summary', title: 'Summary' },
        { id: 'tech_stack', title: 'TechStack' },
    ],
    append: fileExists // Append to the file if it already exists
});

// --- HELPER FUNCTIONS ---

/**
 * A simple delay function to avoid hitting API rate limits.
 * @param {number} ms - The number of milliseconds to wait.
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- Function to read the CSV and find completed repos ---
async function getProcessedRepositories() {
    if (!fileExists) {
        return new Set();
    }
    const processedRepos = new Set();
    return new Promise((resolve, reject) => {
        fs.createReadStream(OUTPUT_CSV_FILE)
            .pipe(csv())
            .on('data', (row) => {
                if (row.RepositoryName) {
                    processedRepos.add(row.RepositoryName);
                }
            })
            .on('end', () => {
                console.log(`Found ${processedRepos.size} previously processed repositories.`);
                resolve(processedRepos);
            })
            .on('error', reject);
    });
}

/**
 * Fetches the content of the README.md file from a given repository.
 * @param {string} repositoryName - The name of the CodeCommit repository.
 * @returns {Promise<string|null>} The README content as a string, or null if not found.
 */
async function getReadmeContent(repositoryName) {
    try {
        const command = new GetFileCommand({
            repositoryName,
            filePath: "README.md",
        });
        const response = await codecommitClient.send(command);
        return Buffer.from(response.fileContent).toString('utf-8');
    } catch (error) {
        if (error.name === 'FileDoesNotExistException') {
            console.warn(`[INFO] No README.md found in repository: ${repositoryName}`);
        } else {
            console.error(`[ERROR] Failed to get README for ${repositoryName}:`, error.message);
        }
        return null;
    }
}

/**
 * Uses the Gemini API to get a summary and tech stack from README text.
 * @param {string} readmeText - The text content of the README file.
 * @returns {Promise<{summary: string, tech: string}>} An object containing the summary and tech stack.
 */
async function getAiSummaryAndTech(readmeText) {
    if (!readmeText || readmeText.trim() === '') {
        return { summary: "N/A - Empty README", tech: "N/A" };
    }

    const prompt = `
        Analyze the following README text. Provide your response as a JSON object with two keys: "summary" and "tech_stack".
        1.  "summary": A concise, one or two-sentence summary of the project's purpose.
        2.  "tech_stack": A comma-separated string listing the main technologies, languages, or frameworks mentioned (e.g., "Node.js, React, AWS S3, Docker").

        README Text:
        ---
        ${readmeText}
        ---
    `;

    const maxRetries = 4;
    let initialDelay = 2000; // start with a 2-second delay

    // --- Loop for Retries ---
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(jsonString);

            return {
                summary: parsedData.summary || "Summary not generated",
                tech: parsedData.tech_stack || "Tech stack not identified",
            };
        } catch (error) {
            console.warn(`   -> [WARN] API call failed on attempt ${attempt + 1}/${maxRetries}. Retrying...`);

            if (attempt === maxRetries - 1) {
                console.error("[ERROR] Gemini API call failed after all retries:", error.message);
                break; // Exit the loop
            }

            await delay(initialDelay);
            initialDelay *= 2;
        }
    }

    return { summary: "Error: AI analysis failed after multiple retries", tech: "Error" };
}


// --- MAIN EXECUTION ---

async function main() {
    console.log("🚀 Starting repository analysis...");

    try {

        const processedRepos = await getProcessedRepositories();

        console.log("Fetching repository list from AWS CodeCommit...");
        const listReposCommand = new ListRepositoriesCommand({});
        const repoListResponse = await codecommitClient.send(listReposCommand);
        const allRepoNames = repoListResponse.repositories.map(repo => repo.repositoryName);

        const reposToProcess = allRepoNames.filter(name => !processedRepos.has(name));

        if (reposToProcess.length === 0) {
            console.log("No repositories found in this AWS account and region.");
            return;
        }

        console.log(`Found ${reposToProcess.length} repositories. Processing now...`);
        const records = [];

        for (const repoName of reposToProcess) {
            console.log(`\nProcessing: ${repoName}`);

            const readme = await getReadmeContent(repoName);

            let summary = "N/A - No README";
            let tech = "N/A";

            if (readme) {
                const aiData = await getAiSummaryAndTech(readme);
                summary = aiData.summary;
                tech = aiData.tech;
                console.log(`   -> Summary: ${summary}`);
                console.log(`   -> Tech: ${tech}`);
            }

            const record = {
                name: repoName,
                summary,
                tech_stack: tech,
            };

            await csvWriter.writeRecords([record]);
            console.log(`   -> ✅ Saved progress for ${repoName}.`);

            await delay(1000);
        }

        console.log(`\n✅ Success! Data written to ${OUTPUT_CSV_FILE}`);

    } catch (error) {
        console.error("\n💥 An unexpected error occurred during the process:", error);
    }
}

main();
