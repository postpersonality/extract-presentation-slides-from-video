import axios from 'axios';
import { Client } from '@elastic/elasticsearch';
import * as dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

// Environment variables
const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL;
const CONfluence_USERNAME = process.env.CONFLUENCE_USERNAME; // Or your email if using PAT
const CONFLUENCE_PAT = process.env.CONFLUENCE_PAT;
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/embeddings';
const ELASTICSEARCH_NODE = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
const ELASTICSEARCH_INDEX_NAME = process.env.ELASTICSEARCH_INDEX_NAME || 'confluence_embeddings';
const ELASTICSEARCH_USERNAME = process.env.ELASTICSEARCH_USERNAME; // Optional: for basic auth
const ELASTICSEARCH_PASSWORD = process.env.ELASTICSEARCH_PASSWORD; // Optional: for basic auth
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'mxbai-embed-large:latest';

// Elasticsearch client
let esClientConfig: any = { node: ELASTICSEARCH_NODE };
if (ELASTICSEARCH_USERNAME && ELASTICSEARCH_PASSWORD) {
    esClientConfig.auth = {
        username: ELASTICSEARCH_USERNAME,
        password: ELASTICSEARCH_PASSWORD,
    };
}
// It's good practice to also configure requestTimeout and other options for production
esClientConfig.requestTimeout = 60000; // 60 seconds, adjust as needed

const esClient = new Client(esClientConfig);

// Environment variable to trigger fixture data usage
const USE_FIXTURE_DATA = process.env.USE_FIXTURE_DATA === 'true';

interface ConfluencePage {
    id: string;
    title: string;
    body: {
        storage: {
            value: string;
        };
    };
    // Add other relevant fields if needed
}

interface EmbeddingResponse {
    embedding: number[];
}

/**
 * Fetches all pages from a Confluence space.
 * Handles pagination.
 * @param spaceKey The key of the Confluence space.
 * @returns Promise<ConfluencePage[]>
 */
async function getConfluencePages(spaceKey: string): Promise<ConfluencePage[]> {
    if (USE_FIXTURE_DATA) {
        console.log('Using fixture data for Confluence pages.');
        return [
            {
                id: 'fixture1',
                title: 'Fixture Page 1 - English & Русский',
                body: {
                    storage: {
                        value: `<h1>Test Page 1</h1><p>This is a test page with <b>English</b> content.</p><p>Это тестовая страница с содержанием на <b>русском</b> языке.</p><p>Mixed content: Hello, мир!</p><ul><li>Item 1</li><li>Элемент 2</li></ul><ac:structured-macro ac:name="code" ac:schema-version="1"><ac:parameter ac:name="language">java</ac:parameter><ac:plain-text-body><![CDATA[public class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println("Hello, World from code block!");\n    }\n}]]></ac:plain-text-body></ac:structured-macro><p>Another sentence. Еще одно предложение.</p>`,
                    },
                },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            },
            {
                id: 'fixture2',
                title: 'Fixture Page 2 - Only English',
                body: {
                    storage: {
                        value: `<h2>Another Test Page</h2><p>This page contains only <i>English</i> text. It discusses various topics like <a href="http://example.com">hyperlinks</a> and more.</p><p>&nbsp;</p><p>Some special characters: &amp; &lt; &gt; &quot; &#39;</p>`,
                    },
                },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            },
            {
                id: 'fixture3',
                title: 'Страница на русском языке - Russian Only',
                body: {
                    storage: {
                        value: `<h1>Полностью на русском</h1><p>Эта страница содержит только русский текст. Обсуждаются различные темы, например, <strong>важные вопросы</strong> и <em>разные ответы</em>.</p><p>Пример кода: <code>console.log("Привет, мир!");</code></p>`,
                    },
                },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            },
            {
                id: 'fixture4',
                title: 'Page with no real content',
                body: {
                    storage: {
                        value: `<p>&nbsp;&nbsp;&nbsp;</p><br />`, // only whitespace and breaks
                    },
                },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            },
            {
                id: 'fixture5',
                title: 'Page with empty content value',
                body: {
                    storage: {
                        value: ``,
                    },
                },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            }
        ];
    }

    const allPages: ConfluencePage[] = [];
    let start = 0;
    const limit = 50; // Adjust as needed, Confluence API page limit
    let isLast = false;

    // Corrected CONFLUENCE_USERNAME variable name
    if (!CONFLUENCE_BASE_URL || !process.env.CONFLUENCE_USERNAME || !CONFLUENCE_PAT) {
        console.error('Confluence credentials or base URL not configured in .env file.');
        throw new Error('Confluence credentials or base URL not configured.');
    }

    console.log(`Fetching pages from space: ${spaceKey}`);

    while (!isLast) {
        try {
            const response = await axios.get(
                `${CONFLUENCE_BASE_URL}/rest/api/content`,
                {
                    headers: {
                        'Accept': 'application/json',
                    },
                    auth: {
                        username: process.env.CONFLUENCE_USERNAME, // Corrected variable
                        password: CONFLUENCE_PAT,
                    },
                    params: {
                        spaceKey: spaceKey,
                        expand: 'body.storage', // Get page content in storage format
                        start: start,
                        limit: limit,
                    },
                }
            );

            const pages = response.data.results as ConfluencePage[];
            allPages.push(...pages);

            if (pages.length < limit) { // Check if it's the last page
                isLast = true;
            } else {
                start += limit;
            }
            console.log(`Fetched ${pages.length} pages, total so far: ${allPages.length}`);
        } catch (error) {
            console.error('Error fetching pages from Confluence:', error.response?.data || error.message);
            throw error;
        }
    }
    console.log(`Finished fetching all pages. Total: ${allPages.length}`);
    return allPages;
}

/**
 * Generates embeddings for a given text using Ollama.
 * @param text The text to embed.
 * @returns Promise<number[]>
 */
async function getOllamaEmbedding(text: string): Promise<number[]> {
    try {
        const response = await axios.post<EmbeddingResponse>(
            OLLAMA_API_URL,
            {
                model: OLLAMA_EMBEDDING_MODEL,
                prompt: text,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data.embedding;
    } catch (error) {
        console.error('Error generating embedding from Ollama:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Cleans HTML content (from Confluence storage format) into plain text.
 * Basic cleaning, can be improved with a more robust HTML-to-text library.
 * @param htmlContent HTML string.
 * @returns Plain text string.
 */
function cleanHtmlContent(htmlContent: string): string {
    // Basic cleaning: remove HTML tags. Consider a library for more complex scenarios.
    let text = htmlContent.replace(/<[^>]*>/g, ' '); // Replace tags with space
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'");
    // Remove extra whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}


/**
 * Ensures the Elasticsearch index exists with the correct mapping.
 */
async function ensureElasticsearchIndex() {
    try {
        const indexExists = await esClient.indices.exists({ index: ELASTICSEARCH_INDEX_NAME });

        if (!indexExists) {
            console.log(`Index '${ELASTICSEARCH_INDEX_NAME}' does not exist. Creating it...`);
            const vectorSize = OLLAMA_EMBEDDING_MODEL === 'all-minilm:l6-v2' ? 384 : 1024;
            await esClient.indices.create({
                index: ELASTICSEARCH_INDEX_NAME,
                body: {
                    mappings: {
                        properties: {
                            title: { type: 'text' },
                            spaceKey: { type: 'keyword' },
                            content: { type: 'text' },
                            url: { type: 'keyword' },
                            lastModified: { type: 'date' },
                            embedding: {
                                type: 'dense_vector',
                                dims: vectorSize,
                                // index: true, // Default is true for dense_vector
                                // similarity: 'cosine' // Default for dense_vector if not specified, or use 'l2_norm', 'dot_product'
                            },
                        },
                    },
                },
            });
            console.log(`Index '${ELASTICSEARCH_INDEX_NAME}' created successfully with mapping.`);
        } else {
            console.log(`Index '${ELASTICSEARCH_INDEX_NAME}' already exists.`);
            // Optionally, update mapping if needed, though this can be complex for existing data.
        }
    } catch (error) {
        // Type assertion for error object
        const esError = error as any;
        if (esError.meta && esError.meta.body) {
            console.error('Error ensuring Elasticsearch index:', JSON.stringify(esError.meta.body, null, 2));
        } else {
            console.error('Error ensuring Elasticsearch index:', error);
        }
        throw error;
    }
}

/**
 * Upserts a document (page) with its embedding into Elasticsearch.
 * @param page The Confluence page.
 * @param embedding The embedding vector.
 * @param textContent The cleaned text content of the page.
 */
async function upsertToElasticsearch(page: ConfluencePage, embedding: number[], textContent: string) {
    try {
        await esClient.index({
            index: ELASTICSEARCH_INDEX_NAME,
            id: page.id, // Use Confluence page ID as Elasticsearch document ID
            document: {
                title: page.title,
                spaceKey: page.space?.key || 'N/A',
                content: textContent,
                url: `${CONFLUENCE_BASE_URL}/pages/viewpage.action?pageId=${page.id}`,
                lastModified: page._expandable?.lastModified || new Date().toISOString(),
                embedding: embedding,
            },
            refresh: 'wait_for', // or true, or false depending on consistency needs
        });
        console.log(`Indexed page '${page.title}' (ID: ${page.id}) to Elasticsearch.`);
    } catch (error) {
        const esError = error as any;
        if (esError.meta && esError.meta.body) {
            console.error(`Error indexing page ${page.id} to Elasticsearch:`, JSON.stringify(esError.meta.body, null, 2));
        } else {
            console.error(`Error indexing page ${page.id} to Elasticsearch:`, error);
        }
        // Decide if you want to throw the error or just log it and continue
    }
}

/**
 * Searches documents in Elasticsearch by semantic similarity of the query text.
 * @param queryText The text to search for.
 * @param topK The number of top results to return.
 * @returns Promise<any[]>
 */
async function searchByText(queryText: string, topK: number = 5): Promise<any[]> {
    console.log(`Searching for: "${queryText}"`);
    try {
        // 1. Generate embedding for the query text
        const queryEmbedding = await getOllamaEmbedding(queryText);
        if (!queryEmbedding || queryEmbedding.length === 0) {
            console.error('Failed to generate embedding for the query text.');
            return [];
        }

        // 2. Perform kNN search in Elasticsearch
        const response = await esClient.search({
            index: ELASTICSEARCH_INDEX_NAME,
            knn: {
                field: 'embedding',
                query_vector: queryEmbedding,
                k: topK,
                num_candidates: Math.max(100, topK * 5), // num_candidates should be >= k
            },
            _source: ['title', 'url', 'lastModified'] // Specify which fields to return
        });

        console.log(`Found ${response.hits.hits.length} results.`);
        return response.hits.hits.map(hit => ({
            id: hit._id,
            score: hit._score,
            title: hit._source?.title,
            url: hit._source?.url,
            lastModified: hit._source?.lastModified,
        }));

    } catch (error) {
        const esError = error as any;
        if (esError.meta && esError.meta.body) {
            console.error('Error during search:', JSON.stringify(esError.meta.body, null, 2));
        } else {
            console.error('Error during search:', error);
        }
        return [];
    }
}


/**
 * Main ETL or Search process function.
 */
async function main() {
    const searchQuery = process.env.SEARCH_QUERY;

    if (searchQuery) {
        // Perform search
        console.log('Search mode activated.');
        if (!ELASTICSEARCH_NODE || !ELASTICSEARCH_INDEX_NAME) {
            console.error('Elasticsearch Node or Index Name not configured for search. Please check .env file.');
            return;
        }
        try {
            const results = await searchByText(searchQuery);
            if (results.length > 0) {
                console.log('\nSearch Results:');
                results.forEach(result => {
                    console.log(`  Title: ${result.title}`);
                    console.log(`  URL: ${result.url}`);
                    console.log(`  Score: ${result.score}`);
                    console.log(`  Last Modified: ${result.lastModified}`);
                    console.log('  ---');
                });
            } else {
                console.log('No results found.');
            }
        } catch (error) {
            console.error('Search process failed:', error);
            process.exit(1);
        }
    } else {
        // Perform ETL
        const spaceKey = process.env.CONFLUENCE_SPACE_KEY;
        if (!spaceKey && !USE_FIXTURE_DATA) { // spaceKey is not needed if using fixture data for ETL
            console.error('CONFLUENCE_SPACE_KEY not defined in .env file for ETL mode.');
            return;
        }
         if (!CONFLUENCE_BASE_URL && !USE_FIXTURE_DATA) {
            console.error('CONFLUENCE_BASE_URL not defined in .env file for ETL mode.');
            return;
        }


        try {
            console.log('Starting Confluence to Elasticsearch ETL process...');

            // 1. Ensure Elasticsearch index exists
            await ensureElasticsearchIndex();

            // 2. Fetch pages from Confluence
            const pages = await getConfluencePages(spaceKey || ''); // Pass empty if fixture, it will be ignored
            if (pages.length === 0) {
                console.log('No pages found in the specified Confluence space or from fixtures.');
                return;
            }

            console.log(`Processing ${pages.length} pages...`);

            // 3. For each page: clean content, generate embedding, and upsert to Elasticsearch
            for (const page of pages) {
                console.log(`\nProcessing page: "${page.title}" (ID: ${page.id})`);

                const htmlContent = page.body?.storage?.value;
                if (!htmlContent && page.id !== 'fixture5') { // Allow fixture5 to have empty content
                    console.warn(`Page "${page.title}" (ID: ${page.id}) has no content. Skipping.`);
                    continue;
                }


                const plainTextContent = cleanHtmlContent(htmlContent || ""); // Handle null htmlContent
                if (!plainTextContent && page.id !== 'fixture4' && page.id !== 'fixture5') { // Allow fixture4,5 for empty text
                    console.warn(`Page "${page.title}" (ID: ${page.id}) has no text after cleaning. Skipping.`);
                    continue;
                }

                // For very long documents, consider chunking strategies
                // For now, we embed the whole page content.
                if (plainTextContent) { // Only generate embedding if there's text
                    console.log(`Generating embedding for "${page.title}"...`);
                    const embedding = await getOllamaEmbedding(plainTextContent);

                    if (embedding && embedding.length > 0) {
                        await upsertToElasticsearch(page, embedding, plainTextContent);
                    } else {
                        console.warn(`Failed to generate embedding for "${page.title}" (ID: ${page.id}). Skipping.`);
                    }
                } else {
                     // Handle pages that are meant to be empty (like fixture4 and fixture5)
                    // Still "upsert" them so they exist in the index, but without an embedding.
                    // Or decide to skip them entirely if an embedding is mandatory.
                    // For now, let's upsert them with an empty string for content and no embedding or an empty one.
                    // This requires upsertToElasticsearch to handle potential empty embeddings if we choose that path.
                    // The current kNN search would ignore docs without an 'embedding' field or with a malformed one.
                    // For simplicity, we'll just log and skip creating an embedding if no text.
                    // The upsert will then also be skipped.
                    console.warn(`Page "${page.title}" (ID: ${page.id}) resulted in no plain text content. No embedding generated.`);
                }
            }

            console.log('\nETL process completed successfully!');
        } catch (error) {
            console.error('ETL process failed:', error);
            process.exit(1); // Exit with error code
        }
    }
}

// Run the main ETL / Search function
main();
declare module 'axios' {
    export interface AxiosRequestConfig {
      auth?: {
        username?: string;
        password?: string;
      };
    }
  }

  interface ConfluencePage {
    id: string;
    title: string;
    body: {
        storage: {
            value: string;
        };
    };
    space?: { // Added space information
        key: string;
    };
    _expandable?: { // For potential extra fields like lastModified
        lastModified?: string;
    };
    // Add other relevant fields if needed
}
