import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { QDRANT_COLLECTION_NAME } from './config';
import { qdrantClient } from './clients';
import { getOllamaEmbedding } from './utils';

// dotenv.config() is called in config.ts
// OLLAMA_API_URL, OLLAMA_EMBEDDING_MODEL are used by getOllamaEmbedding in utils.ts
// QDRANT_URL is used by qdrantClient in clients.ts

// Interface EmbeddingResponse is imported/handled by utils.ts

/**
 * Searches the Qdrant collection for documents similar to the query text.
 * @param query The text to search for.
 * @param topK The number of top results to return.
 */
export async function searchByText(query: string, topK: number = 5) {
    if (!query || query.trim() === "") {
        console.error("Search query cannot be empty.");
        return;
    }

    console.log(`Searching for: "${query}" (top ${topK} results)`);

    try {
        // 1. Generate embedding for the query
        console.log("Generating embedding for the search query...");
        const queryEmbedding = await getOllamaEmbedding(query);

        if (!queryEmbedding || queryEmbedding.length === 0) {
            console.error("Failed to generate embedding for the query.");
            return;
        }

        // 2. Search Qdrant
        console.log("Searching Qdrant collection...");
        const searchResult = await qdrantClient.search(QDRANT_COLLECTION_NAME, {
            vector: queryEmbedding,
            limit: topK,
            with_payload: true, // Retrieve the payload
            // with_vector: false // Optionally retrieve the vector itself
        });

        if (searchResult.length === 0) {
            console.log("No results found.");
            return;
        }

        // 3. Display results
        console.log("\nSearch Results:");
        searchResult.forEach((result, index) => {
            console.log(`\n${index + 1}. Score: ${result.score.toFixed(4)}`);
            if (result.payload) {
                console.log(`   Title: ${result.payload.title}`);
                console.log(`   Confluence ID: ${result.payload.confluencePageId}`);
                console.log(`   URL: ${result.payload.url}`);
                // Optionally display a snippet of the content
                // const contentSnippet = result.payload.content?.toString().substring(0, 200) + "...";
                // console.log(`   Snippet: ${contentSnippet}`);
            } else {
                console.log("   Payload not available for this result.");
            }
        });

    } catch (error) {
        console.error("Error during search:", error);
    }
}

// Command-line argument parsing and execution for search
async function runSearch() {
    const argv = await yargs(hideBin(process.argv))
        .command('search <query>', 'Search for documents in Qdrant', (yargs) => {
            return yargs
                .positional('query', {
                    describe: 'The search query text',
                    type: 'string',
                    demandOption: true, // Ensure query is provided
                })
                .option('topk', {
                    alias: 'k',
                    type: 'number',
                    default: 5,
                    describe: 'Number of top results to return'
                });
        }, async (argv) => {
            // Type assertion for query as yargs should ensure it's a string due to demandOption and type
            await searchByText(argv.query as string, argv.topk as number);
        })
        .demandCommand(1, 'You must provide the "search" command followed by a query.')
        .help()
        .alias('help', 'h')
        .strict()
        .argv;

    // This check is to ensure that if the script is run with 'search' command, it executes.
    // Yargs processes commands and invokes the handler. If no command matches, it might show help.
    // We need to ensure that if 'search' is the command, the handler logic in searchByText runs.
    // The way yargs is set up, the handler for 'search' command already calls searchByText.
    // So, direct invocation of runSearch() should be enough.
}

// If this file is executed directly, run the search CLI.
// This allows `ts-node src/search.ts search "my query"`
if (require.main === module) {
    runSearch();
}
