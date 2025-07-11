import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
    CONFLUENCE_BASE_URL,
    CONFLUENCE_USERNAME,
    CONFLUENCE_PAT,
    USE_FIXTURE_DATA,
    QDRANT_COLLECTION_NAME,
    VECTOR_SIZE, // Use this instead of recalculating
    CONFLUENCE_SPACE_KEY // Use this from config
} from './config';
import { qdrantClient } from './clients';
import { getOllamaEmbedding } from './utils'; // Correctly imported

// dotenv.config() is called in config.ts

interface ConfluencePage {
    id: string;
    title: string;
    body: {
        storage: {
            value: string;
        };
    };
    space?: {
        key: string;
    };
    _expandable?: {
        lastModified?: string;
    };
}

// EmbeddingResponse interface is defined in utils.ts and used by the imported getOllamaEmbedding

async function getConfluencePages(spaceKey: string): Promise<ConfluencePage[]> {
    if (USE_FIXTURE_DATA) {
        console.log('Using fixture data for Confluence pages.');
        return [
            {
                id: uuidv4(),
                title: 'Fixture Page 1 - English & Русский',
                body: { storage: { value: `<h1>Test Page 1</h1><p>This is a test page with <b>English</b> content.</p><p>Это тестовая страница с содержанием на <b>русском</b> языке.</p><p>Mixed content: Hello, мир!</p><ul><li>Item 1</li><li>Элемент 2</li></ul><ac:structured-macro ac:name="code" ac:schema-version="1"><ac:parameter ac:name="language">java</ac:parameter><ac:plain-text-body><![CDATA[public class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println("Hello, World from code block!");\n    }\n}]]></ac:plain-text-body></ac:structured-macro><p>Another sentence. Еще одно предложение.</p>` } },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            },
            {
                id: uuidv4(),
                title: 'Fixture Page 2 - Only English',
                body: { storage: { value: `<h2>Another Test Page</h2><p>This page contains only <i>English</i> text. It discusses various topics like <a href="http://example.com">hyperlinks</a> and more.</p><p>&nbsp;</p><p>Some special characters: &amp; &lt; &gt; &quot; &#39;</p>` } },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            },
            {
                id: uuidv4(),
                title: 'Страница на русском языке - Russian Only',
                body: { storage: { value: `<h1>Полностью на русском</h1><p>Эта страница содержит только русский текст. Обсуждаются различные темы, например, <strong>важные вопросы</strong> и <em>разные ответы</em>.</p><p>Пример кода: <code>console.log("Привет, мир!");</code></p>` } },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            },
            {
                id: uuidv4(),
                title: 'Page with no real content',
                body: { storage: { value: `<p>&nbsp;&nbsp;&nbsp;</p><br />` } },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            },
            {
                id: uuidv4(),
                title: 'Page with empty content value',
                body: { storage: { value: `` } },
                space: { key: spaceKey },
                _expandable: { lastModified: new Date().toISOString() }
            }
        ];
    }

    const allPages: ConfluencePage[] = [];
    let start = 0;
    const limit = 50;
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
                    headers: { 'Accept': 'application/json' },
                    auth: { username: CONFLUENCE_USERNAME, password: CONFLUENCE_PAT },
                    params: { spaceKey: spaceKey, expand: 'body.storage', start: start, limit: limit },
                }
            );
            const pages = response.data.results as ConfluencePage[];
            allPages.push(...pages);
            if (pages.length < limit) {
                isLast = true;
            } else {
                start += limit;
            }
            console.log(`Fetched ${pages.length} pages, total so far: ${allPages.length}`);
        } catch (e) {
            const error = e as any;
            console.error('Error fetching pages from Confluence:', error.response?.data || error.message);
            throw error;
        }
    }
    console.log(`Finished fetching all pages. Total: ${allPages.length}`);
    return allPages;
}

// Removed the local duplicate of getOllamaEmbedding. The imported one from utils.ts will be used.

function cleanHtmlContent(htmlContent: string): string {
    let text = htmlContent.replace(/<[^>]*>/g, ' ');
    text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

async function ensureQdrantCollection() {
    try {
        const collections = await qdrantClient.getCollections();
        const collectionExists = collections.collections.some(c => c.name === QDRANT_COLLECTION_NAME);

        if (!collectionExists) {
            console.log(`Collection '${QDRANT_COLLECTION_NAME}' does not exist. Creating it...`);
            await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
                vectors: {
                    size: VECTOR_SIZE, // Use VECTOR_SIZE from config
                    distance: 'Cosine',
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

async function upsertToQdrant(page: ConfluencePage, embedding: number[], textContent: string) {
    let qdrantId: number | string;

    if (USE_FIXTURE_DATA) {
        qdrantId = page.id;
    } else {
        const parsedId = parseInt(page.id, 10);
        if (!isNaN(parsedId)) {
            qdrantId = parsedId;
        } else {
            console.warn(`Confluence page ID "${page.id}" is not an integer. Generating UUID for Qdrant point.`);
            qdrantId = uuidv4();
        }
    }

    try {
        await qdrantClient.upsert(QDRANT_COLLECTION_NAME, {
            points: [
                {
                    id: qdrantId,
                    vector: embedding,
                    payload: {
                        confluencePageId: page.id,
                        title: page.title,
                        spaceKey: page.space?.key || 'N/A',
                        content: textContent,
                        url: `${CONFLUENCE_BASE_URL}/pages/viewpage.action?pageId=${page.id}`,
                        lastModified: page._expandable?.lastModified || new Date().toISOString(),
                    },
                },
            ],
        });
        console.log(`Upserted page '${page.title}' (ID: ${page.id}) to Qdrant.`);
    } catch (error) {
        console.error(`Error upserting page ${page.id} to Qdrant:`, error);
    }
}

async function main() {
    // Use CONFLUENCE_SPACE_KEY from config.ts
    if (!CONFLUENCE_SPACE_KEY) {
        console.error('CONFLUENCE_SPACE_KEY not defined in .env file or config.');
        return;
    }

    try {
        console.log('Starting Confluence to Qdrant ETL process...');
        await ensureQdrantCollection();
        const pages = await getConfluencePages(CONFLUENCE_SPACE_KEY); // Use imported constant
        if (pages.length === 0) {
            console.log('No pages found in the specified Confluence space.');
            return;
        }

        console.log(`Processing ${pages.length} pages...`);

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
            console.log(`Generating embedding for "${page.title}"...`);
            const embedding = await getOllamaEmbedding(plainTextContent); // Uses imported function
            if (embedding && embedding.length > 0) {
                await upsertToQdrant(page, embedding, plainTextContent);
            } else {
                console.warn(`Failed to generate embedding for "${page.title}" (ID: ${page.id}). Skipping.`);
            }
        }
        console.log('\nETL process completed successfully!');
    } catch (error) {
        console.error('ETL process failed:', error);
        process.exit(1);
    }
}

async function runEtl() {
    await yargs(hideBin(process.argv))
        .command('etl', 'Run the full ETL process to ingest Confluence data into Qdrant', () => {}, async () => {
            console.log('Starting ETL process command...');
            await main();
        })
        .demandCommand(1, 'You need to specify the "etl" command to run this script.')
        .help()
        .alias('help', 'h')
        .strict()
        .argv;
}

if (require.main === module) {
    runEtl();
}

// Removed all trailing comments and duplicate function/interface definitions.
// Ensured all imported constants and functions are used correctly.
