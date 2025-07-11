import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_URL } from './config';

if (!QDRANT_URL) {
    console.error('QDRANT_URL is not defined. Please check your .env file or environment variables.');
    process.exit(1);
}

export const qdrantClient = new QdrantClient({ url: QDRANT_URL });
