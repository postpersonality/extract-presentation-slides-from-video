# Confluence to Vector DB ETL

This project implements an ETL (Extract, Transform, Load) process to fetch content from a Confluence server, generate embeddings using a local Ollama instance, and store them in a Qdrant vector database.

## Features

- Fetches pages from a specified Confluence space.
- Uses a local Ollama instance with the `mxbai-embed-large:latest` model for generating embeddings.
- Stores page content and embeddings in a local Qdrant vector database.
- Configurable through environment variables.
- Docker Compose setup for easy deployment of Ollama and Qdrant.

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
    Edit `.env` with your Confluence URL, username (email for PAT), PAT, space key, and any custom Ollama/Qdrant settings if you deviated from the defaults.

    **Required `.env` variables:**
    - `CONFLUENCE_BASE_URL`: Your Confluence instance URL (e.g., `https://your-domain.atlassian.net/wiki` or `http://localhost:8090` for local server).
    - `CONFLUENCE_USERNAME`: The email address associated with your Confluence account (used with PAT).
    - `CONFLUENCE_PAT`: Your Confluence Personal Access Token. Ensure it has read access to the desired spaces.
    - `CONFLUENCE_SPACE_KEY`: The key of the Confluence space you want to index.

    **Default `.env` variables (can be overridden):**
    - `OLLAMA_API_URL=http://localhost:11434/api/embeddings`
    - `OLLAMA_EMBEDDING_MODEL=mxbai-embed-large:latest`
    - `QDRANT_URL=http://localhost:6333`
    - `QDRANT_COLLECTION_NAME=confluence_embeddings`

4.  **Start Ollama and Qdrant services:**
    This command will also pull the `mxbai-embed-large:latest` model for Ollama if it's not already present locally.
    ```bash
    docker-compose up -d
    ```
    - Ollama will be accessible at `http://localhost:11434`.
    - Qdrant will be accessible at `http://localhost:6333`.
    - Data for Ollama and Qdrant will be persisted in `./ollama_data` and `./qdrant_data` directories respectively.

    *Note for GPU users*: The `docker-compose.yml` includes a basic GPU reservation for Ollama. Ensure your Docker setup and NVIDIA drivers support this. If you don't have a GPU or encounter issues, you can remove the `deploy` section from the `ollama` service in `docker-compose.yml`. Ollama will run on CPU by default.

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

## How it Works

1.  The script connects to the Confluence instance using the provided base URL and Personal Access Token.
2.  It fetches all pages from the specified `CONFLUENCE_SPACE_KEY`, handling pagination.
3.  For each page:
    a.  The HTML content (`body.storage`) is cleaned to extract plain text.
    b.  The plain text is sent to the local Ollama API (`/api/embeddings`) to generate a vector embedding using the `mxbai-embed-large` model.
    c.  The script ensures a Qdrant collection (defined by `QDRANT_COLLECTION_NAME`) exists, creating it if necessary. The collection is configured for vectors of size 1024 (matching `mxbai-embed-large`) using Cosine distance.
    d.  The page ID, embedding vector, title, cleaned text content, and Confluence page URL are upserted into the Qdrant collection.

## Stopping Services

To stop the Ollama and Qdrant services:
```bash
docker-compose down
```
If you also want to remove the persisted data volumes (use with caution):
```bash
docker-compose down -v
```

## Troubleshooting

-   **Ollama Model Pull:** If `docker-compose up` fails to pull the Ollama model, you might need to pull it manually first:
    ```bash
    docker exec -it <ollama_container_name_or_id> ollama pull mxbai-embed-large:latest
    ```
    Then restart the services.
-   **Confluence API Errors:** Check your `CONFLUENCE_BASE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_PAT`, and `CONFLUENCE_SPACE_KEY` in the `.env` file. Ensure the PAT has the correct permissions.
-   **Qdrant Connection Issues:** Verify Qdrant is running (`docker ps`) and accessible at the configured `QDRANT_URL`.
-   **Embedding Dimension Mismatch:** The Qdrant collection is created with vector size 1024, which is standard for `mxbai-embed-large`. If you use a different model, you'll need to adjust the `size` parameter in `ensureQdrantCollection()` in `src/etl.ts`.

## TODO / Potential Improvements

-   More robust HTML to plain text conversion (e.g., using a dedicated library like `html-to-text`).
-   Implement content chunking for very large Confluence pages to stay within embedding model context limits and improve retrieval relevance.
-   Add more sophisticated error handling and retry mechanisms.
-   Incremental updates: Fetch only recently modified pages from Confluence.
-   Support for attachments.
-   More detailed logging.
-   Unit and integration tests.
```
