import axios from 'axios';
import { OLLAMA_API_URL, OLLAMA_EMBEDDING_MODEL } from './config';

export interface EmbeddingResponse {
    embedding: number[];
}

/**
 * Generates embeddings for a given text using Ollama.
 * @param text The text to embed.
 * @returns Promise<number[]>
 */
export async function getOllamaEmbedding(text: string): Promise<number[]> {
    if (!OLLAMA_API_URL || !OLLAMA_EMBEDDING_MODEL) {
        console.error('Ollama API URL or Model is not defined. Please check your .env file or environment variables.');
        throw new Error('Ollama API URL or Model not configured.');
    }
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
    } catch (e) {
        const error = e as any; // Cast to any to access response data
        console.error('Error generating embedding from Ollama:', error.response?.data || error.message);
        throw error;
    }
}
