import axios from 'axios';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config(); // Load environment variables from .env file

// Environment variables
const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL;
const CONFLUENCE_USERNAME = process.env.CONFLUENCE_USERNAME; // Or your email if using PAT
const CONFLUENCE_PAT = process.env.CONFLUENCE_PAT;
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/embeddings';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'confluence_embeddings';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'mxbai-embed-large:latest';

// Qdrant client
const qdrantClient = new QdrantClient({ url: QDRANT_URL });

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
        // Generate UUIDs for fixture data IDs to be Qdrant compatible
        return [
            {
                id: uuidv4(), // Qdrant compatible ID
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
                id: uuidv4(), // Qdrant compatible ID
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
                id: uuidv4(), // Qdrant compatible ID
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
                id: uuidv4(), // Qdrant compatible ID
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
                id: uuidv4(), // Qdrant compatible ID
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

    if (!CONFLUENCE_BASE_URL || !CONFLUENCE_USERNAME || !CONFLUENCE_PAT) {
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
                        username: CONFLUENCE_USERNAME,
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
 * Ensures the Qdrant collection exists.
 */
async function ensureQdrantCollection() {
    try {
        const collections = await qdrantClient.getCollections();
        const collectionExists = collections.collections.some(c => c.name === QDRANT_COLLECTION_NAME);

        if (!collectionExists) {
            console.log(`Collection '${QDRANT_COLLECTION_NAME}' does not exist. Creating it...`);
            // Define the vector parameters based on the OLLAMA_EMBEDDING_MODEL
            // Dimension for all-minilm:l6-v2 is 384.
            // Dimension for mxbai-embed-large is 1024.
            const vectorSize = OLLAMA_EMBEDDING_MODEL === 'all-minilm:l6-v2' ? 384 : 1024;
            await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
                vectors: {
                    size: vectorSize,
                    distance: 'Cosine', // Or 'Euclid', 'Dot'
                },
            });
            console.log(`Collection '${QDRANT_COLLECTION_NAME}' created successfully.`);
        } else {
            console.log(`Collection '${QDRANT_COLLECTION_NAME}' already exists.`);
        }
    } catch (error) {
        console.error('Error ensuring Qdrant collection:', error);
        throw error;
    }
}

/**
 * Upserts a document (page) with its embedding into Qdrant.
 * @param page The Confluence page.
 * @param embedding The embedding vector.
 */
async function upsertToQdrant(page: ConfluencePage, embedding: number[], textContent: string) {
    let qdrantId: number | string;

    if (USE_FIXTURE_DATA) {
        // Fixture data IDs are already UUIDs (strings)
        qdrantId = page.id;
    } else {
        // For real Confluence data, try to parse ID as integer
        const parsedId = parseInt(page.id, 10);
        if (!isNaN(parsedId)) {
            qdrantId = parsedId;
        } else {
            // If Confluence ID is not a number (unexpected, but good to handle), generate a UUID
            console.warn(`Confluence page ID "${page.id}" is not an integer. Generating UUID for Qdrant point.`);
            qdrantId = uuidv4();
        }
    }

    try {
        await qdrantClient.upsertPoints(QDRANT_COLLECTION_NAME, {
            points: [
                {
                    id: qdrantId,
                    vector: embedding,
                    payload: {
                        confluencePageId: page.id, // Store original Confluence ID in payload
                        title: page.title,
                        spaceKey: page.space?.key || 'N/A', // Assuming space key might be available
                        content: textContent, // Store the cleaned text content
                        url: `${CONFLUENCE_BASE_URL}/pages/viewpage.action?pageId=${page.id}`,
                        lastModified: page._expandable?.lastModified || new Date().toISOString(),
                        // Add any other metadata you want to store and filter on
                    },
                },
            ],
        });
        console.log(`Upserted page '${page.title}' (ID: ${page.id}) to Qdrant.`);
    } catch (error) {
        console.error(`Error upserting page ${page.id} to Qdrant:`, error);
        // Decide if you want to throw the error or just log it and continue
    }
}

/**
 * Main ETL process function.
 */
async function main() {
    const spaceKey = process.env.CONFLUENCE_SPACE_KEY;
    if (!spaceKey) {
        console.error('CONFLUENCE_SPACE_KEY not defined in .env file.');
        return;
    }

    try {
        console.log('Starting Confluence to Qdrant ETL process...');

        // 1. Ensure Qdrant collection exists
        await ensureQdrantCollection();

        // 2. Fetch pages from Confluence
        const pages = await getConfluencePages(spaceKey);
        if (pages.length === 0) {
            console.log('No pages found in the specified Confluence space.');
            return;
        }

        console.log(`Processing ${pages.length} pages...`);

        // 3. For each page: clean content, generate embedding, and upsert to Qdrant
        for (const page of pages) {
            console.log(`\nProcessing page: "${page.title}" (ID: ${page.id})`);

            const htmlContent = page.body?.storage?.value;
            if (!htmlContent) {
                console.warn(`Page "${page.title}" (ID: ${page.id}) has no content. Skipping.`);
                continue;
            }

            const plainTextContent = cleanHtmlContent(htmlContent);
            if (!plainTextContent) {
                console.warn(`Page "${page.title}" (ID: ${page.id}) has no text after cleaning. Skipping.`);
                continue;
            }

            // For very long documents, consider chunking strategies
            // For now, we embed the whole page content.
            console.log(`Generating embedding for "${page.title}"...`);
            const embedding = await getOllamaEmbedding(plainTextContent);

            if (embedding && embedding.length > 0) {
                await upsertToQdrant(page, embedding, plainTextContent);
            } else {
                console.warn(`Failed to generate embedding for "${page.title}" (ID: ${page.id}). Skipping.`);
            }
        }

        console.log('\nETL process completed successfully!');
    } catch (error) {
        console.error('ETL process failed:', error);
        process.exit(1); // Exit with error code
    }
}

// Run the main ETL function
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
