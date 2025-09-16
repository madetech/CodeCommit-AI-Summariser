# AWS CodeCommit AI Summariser 🤖

This Node.js script scans all repositories in an AWS CodeCommit account, uses the Google Gemini API to generate a summary and identify the tech stack from each repository's README.md file, and outputs the results to a CSV file.

The tool is designed to be resumable, meaning you can run it multiple times. It automatically detects which repositories have already been processed and picks up where it left off, making it ideal for accounts with many repositories or for working around API rate limits.

## Features
- List All Repositories: Automatically fetches a list of every repository in your specified AWS region.

- AI-Powered Analysis: Uses the Google Gemini API to intelligently generate a concise summary and a list of technologies for each project based on its README.

- Resumable Progress: If the script is stopped or hits an API limit, it can be re-run to continue processing only the remaining repositories.

- Automatic Retries: Implements an exponential backoff strategy to automatically retry failed API calls, making it resilient to temporary service unavailability.

- CSV Output: Saves all collected data (repository name, summary, tech stack) into a clean repositories_summary.csv file, ready for use in Google Sheets or Excel.

## Prerequisites
Before you begin, ensure you have the following:

1. Node.js: Download and install Node.js (version 18.x or higher is recommended).

2. AWS Account: An AWS account with an IAM user that has programmatic access. The user needs permissions for CodeCommit (e.g., AWSCodeCommitReadOnly).

3. AWS Credentials: Your AWS Access Key ID and Secret Access Key. The easiest way to configure this is by installing the AWS CLI and running aws configure.

4. Google Gemini API Key: A valid API key from Google AI Studio.

## Setup & Installation
1. Clone or Download

First, get the code on your local machine.

2. Install Dependencies

Navigate into the project directory with your terminal and install the required npm packages by running:

```Bash

npm install
```

This will install all dependencies listed in the package.json file, including:

- @aws-sdk/client-codecommit

- @google/generative-ai

- csv-writer & csv-parser

- dotenv

3. Create Environment File

Create a file named .env in the root of the project folder. This file will securely store your secret keys. Do not commit this file to version control.

Copy the following template into your .env file and replace the placeholder values with your actual credentials:

```Code snippet

# .env

# Google Gemini API Key
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

# AWS Credentials (the script will use these)
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_HERE
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_KEY_HERE
AWS_REGION=eu-west-1
```
Note: Remember to set AWS_REGION to the region where your CodeCommit repositories are located.

## Usage

Once the setup is complete, you can run the script with a single command:

```Bash

node repo-summariser.js
```
The script will begin processing. You will see output in the terminal as it fetches the repository list, skips any previously completed repos, and processes the new ones.

When the script finishes its run (either by completing all repos or hitting an API limit), a `repositories_summary.csv` file will be present in your project folder.

To process more repositories, simply run node repo-summariser.js again at a later time. The script will automatically continue where it left off.
