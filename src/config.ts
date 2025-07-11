import * as dotenv from 'dotenv';

dotenv.config();

export const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL;
export const CONFLUENCE_USERNAME = process.env.CONFLUENCE_USERNAME;
export const CONFLUENCE_PAT = process.env.CONFLUENCE_PAT;
export const CONFLUENCE_SPACE_KEY = process.env.CONFLUENCE_SPACE_KEY;

export const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/embeddings';
export const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'mxbai-embed-large:latest';

export const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
export const QDRANT_COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'confluence_embeddings';

export const USE_FIXTURE_DATA = process.env.USE_FIXTURE_DATA === 'true';

// Determine vector size based on model
export const VECTOR_SIZE = OLLAMA_EMBEDDING_MODEL === 'all-minilm:l6-v2' ? 384 : 1024;
