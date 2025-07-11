# Confluence to Vector DB ETL

This project implements an ETL (Extract, Transform, Load) process to fetch content from a Confluence server, generate embeddings using a local Ollama instance, and store them in an Elasticsearch vector database.

## Features

- Fetches pages from a specified Confluence space.
- Uses a local Ollama instance with models like `mxbai-embed-large:latest` or `all-minilm:l6-v2` for generating embeddings.
- Stores page content and embeddings in a local Elasticsearch instance, configured for vector search.
- **Provides a search mode to query indexed data by semantic similarity.**
- Configurable through environment variables.
- Docker Compose setup for easy deployment of Ollama and Elasticsearch.

## Prerequisites

- Node.js (v18+ recommended)
- npm
- Docker and Docker Compose
- Access to a Confluence Server or Cloud instance with a Personal Access Token (PAT).

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  **Install Node.js dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Copy the example environment file and fill in your specific details:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` with your Confluence URL, username (email for PAT), PAT, space key, and any custom Ollama/Elasticsearch settings if you deviated from the defaults.

    **Required `.env` variables:**
    - `CONFLUENCE_BASE_URL`: Your Confluence instance URL (e.g., `https://your-domain.atlassian.net/wiki` or `http://localhost:8090` for local server).
    - `CONFLUENCE_USERNAME`: The email address associated with your Confluence account (used with PAT).
    - `CONFLUENCE_PAT`: Your Confluence Personal Access Token. Ensure it has read access to the desired spaces.
    - `CONFLUENCE_SPACE_KEY`: The key of the Confluence space you want to index.

    **Default `.env` variables (can be overridden):**
    - `CONFLUENCE_BASE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_PAT`, `CONFLUENCE_SPACE_KEY`: No defaults, must be provided.
    - `OLLAMA_API_URL=http://localhost:11434/api/embeddings`: Target URL for Ollama API.
    - `OLLAMA_EMBEDDING_MODEL=all-minilm:l6-v2`: Specifies the embedding model. This affects vector dimensions in Elasticsearch and the model pulled by Docker Compose.
    - `OLLAMA_HOST_PORT=11434`: Host port for the Ollama service.
    - `ELASTICSEARCH_NODE=http://localhost:9200`: Node URL for the Elasticsearch API, used by the ETL script.
    - `ELASTICSEARCH_INDEX_NAME=confluence_embeddings`: Name of the index in Elasticsearch.
    - `ELASTICSEARCH_HOST_PORT=9200`: Host port mapped to Elasticsearch's HTTP port 9200.
    - `ELASTICSEARCH_USERNAME` (optional): Username for Elasticsearch basic authentication.
    - `ELASTICSEARCH_PASSWORD` (optional): Password for Elasticsearch basic authentication.
    - `USE_FIXTURE_DATA=false`: Set to `true` to use stubbed Confluence data for local testing.
    - `SEARCH_QUERY` (optional): If set, the script runs in search mode using this query string (e.g., `"What are the new features?"`). Otherwise, it runs in ETL mode.


4.  **Start Ollama and Elasticsearch services:**
    This command will also pull the specified `OLLAMA_EMBEDDING_MODEL` for Ollama if it's not already present locally.
    ```bash
    docker-compose up -d
    ```
    - Ollama will be accessible at `http://localhost:${OLLAMA_HOST_PORT:-11434}`.
    - Elasticsearch will be accessible at `http://localhost:${ELASTICSEARCH_HOST_PORT:-9200}`.
    - Data for Ollama and Elasticsearch will be persisted in `./ollama_data` and `./elasticsearch_data` directories respectively.

    *Note for GPU users*: The `docker-compose.yml` includes a basic GPU reservation for Ollama. If you don't have a GPU or encounter issues, remove the `deploy` section from the `ollama` service in `docker-compose.yml`. Ollama will run on CPU.
    *Elasticsearch Security*: For development, X-Pack security is disabled by default in `docker-compose.yml`. For production, enable it and set `ELASTICSEARCH_USERNAME` and `ELASTICSEARCH_PASSWORD`.

## Running the ETL Script

1.  **Build the TypeScript code:**
    ```bash
    npm run build
    ```

2.  **Run the ETL process:**
    ```bash
    npm start
    ```
    This will execute the compiled JavaScript code in `dist/etl.js`.

    Alternatively, for development, you can run the script directly using `ts-node` with `nodemon` for automatic restarts on file changes:
    ```bash
    npm run dev
    ```

## Running in Search Mode

To search the indexed Confluence data:

1.  Ensure your `.env` file is configured, especially `ELASTICSEARCH_NODE`, `ELASTICSEARCH_INDEX_NAME`, and `OLLAMA_API_URL` (for embedding the search query).
2.  Set the `SEARCH_QUERY` environment variable in your `.env` file or as a prefix to the command. For example:
    ```bash
    # In .env file
    SEARCH_QUERY="your question about confluence pages"
    ```
3.  Run the script (after building if not using `npm run dev`):
    ```bash
    npm start
    # OR
    npm run dev
    # OR, by prefixing the variable (works in bash-like shells)
    SEARCH_QUERY="your question" npm start
    ```
    The script will output the top K search results to the console.

## How it Works

The script operates in one of two modes:

**ETL Mode (Default):**
1.  Connects to the Confluence instance using the provided credentials.
2.  Fetches all pages from the specified `CONFLUENCE_SPACE_KEY`.
3.  For each page:
    a.  Cleans HTML content to plain text.
    b.  Generates a vector embedding for the text using Ollama.
    c.  Ensures the Elasticsearch index exists with correct mapping (including `dense_vector` for embeddings).
    d.  Indexes the page ID, embedding, title, content, URL, and other metadata into Elasticsearch.

**Search Mode (if `SEARCH_QUERY` is set):**
1.  Takes the `SEARCH_QUERY` string.
2.  Generates a vector embedding for the query using Ollama.
3.  Performs a k-Nearest Neighbor (kNN) search in Elasticsearch against the `embedding` field of the indexed documents.
4.  Prints the top K matching documents (title, URL, score, last modified date) to the console.

## Stopping Services

To stop the Ollama and Elasticsearch services:
```bash
docker-compose down
```
If you also want to remove the persisted data volumes (use with caution):
```bash
docker-compose down -v
```

## Troubleshooting

-   **Ollama Model Pull:** If `docker-compose up` fails to pull the Ollama model (e.g., `mxbai-embed-large:latest` or `all-minilm:l6-v2`), you might need to pull it manually first:
    ```bash
    # Replace <ollama_container_name_or_id> with the actual name/ID
    # Replace <model_name:tag> with the model specified in your .env
    docker exec -it <ollama_container_name_or_id> ollama pull <model_name:tag>
    ```
    Then restart the services.
-   **Confluence API Errors:** Check your `CONFLUENCE_BASE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_PAT`, and `CONFLUENCE_SPACE_KEY` in the `.env` file. Ensure the PAT has the correct permissions.
-   **Elasticsearch Connection Issues:** Verify Elasticsearch is running (`docker ps`) and accessible at the configured `ELASTICSEARCH_NODE`. Check `docker-compose logs elasticsearch` for startup errors.
-   **Embedding Dimension Mismatch:** The Elasticsearch index mapping for the `embedding` field (`dense_vector`) is created with vector dimensions based on the `OLLAMA_EMBEDDING_MODEL` environment variable (e.g., 1024 for `mxbai-embed-large`, 384 for `all-minilm:l6-v2`). Ensure this matches the model you are using. If you change the model, you may need to delete and recreate the Elasticsearch index for the new dimensions to apply correctly.
-   **Elasticsearch Health:** You can check Elasticsearch cluster health via `curl http://localhost:${ELASTICSEARCH_HOST_PORT:-9200}/_cluster/health?pretty`. It should be `yellow` or `green` for a single node setup.

## TODO / Potential Improvements

-   More robust HTML to plain text conversion (e.g., using a dedicated library like `html-to-text`).
-   Implement content chunking for very large Confluence pages to stay within embedding model context limits and improve retrieval relevance.
-   Add more sophisticated error handling and retry mechanisms.
-   Incremental updates: Fetch only recently modified pages from Confluence.
-   Support for attachments.
-   More detailed logging.
-   Unit and integration tests.
```
